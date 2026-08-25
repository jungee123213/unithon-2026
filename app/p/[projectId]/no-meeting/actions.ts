'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { serverClient } from '@/lib/supabase';
import { currentUser, membershipOf } from '@/lib/auth-server';
import { classifyRequest, linkEvidence, UNCLASSIFIABLE } from '@/lib/no-meeting/classify';
import { isConnectorSource } from '@/lib/no-meeting/connectors';
import { evaluate } from '@/lib/no-meeting/engine';
import { insertLedger, newId, persistEvaluation } from '@/lib/no-meeting/persist';
import { loadNoMeeting } from '@/lib/no-meeting/queries';
import { bindEvidence, extractRefKeys, mergeScopeKeys, parseScopeInput } from '@/lib/no-meeting/scope';
import { verifyJira } from '@/lib/no-meeting/connect/jira';
import { verifySentry } from '@/lib/no-meeting/connect/sentry';
import {
  deleteConfig, readConfig, writeConfig,
  type JiraConfig, type SentryConfig,
} from '@/lib/no-meeting/connect/store';
import { RULE_VERSION } from '@/lib/no-meeting/settings';
import type { ConnectorId, Evaluation, MeetingRequest, MeetingType } from '@/lib/no-meeting/types';

const rid = newId;

/**
 * 신청자가 직접 표시하는 유형.
 * 이 셋은 본문을 읽지 않는 유형이라 사람이 표시하는 것이 맞다 —
 * 1:1 내용을 분류기에 보내지 않겠다는 약속이 여기서 지켜진다.
 */
const MARKERS: Record<string, MeetingType | undefined> = {
  '1on1': 'FEEDBACK_1ON1',
  brainstorming: 'BRAINSTORMING',
  crisis: 'CONFLICT_CRISIS',
};

const MARKER_REASON: Record<string, string> = {
  '1on1': '신청자가 1:1 로 표시했습니다. 제목과 안건은 읽지 않았습니다.',
  brainstorming: '신청자가 브레인스토밍으로 표시했습니다. 안건을 분해하지 않습니다.',
  crisis: '신청자가 긴급·장애로 표시했습니다. 판정으로 늦추지 않습니다.',
};

export type RequestState = { error?: string };

/** 이 사람이 이 프로젝트에서 불리는 이름. 판정 기록의 actor 가 된다. */
async function actorOf(projectId: string) {
  const user = await currentUser();
  if (!user) redirect('/login');
  const m = await membershipOf(user.id, projectId);
  if (!m) redirect('/projects');
  return m.display_name as string;
}

// ── 신청서 ────────────────────────────────────────────────────────
/**
 * 회의를 잡기 전에 통과해야 하는 신청서.
 * 내는 즉시 판정한다 — "회의가 열리기 전에 판정한다" 가 이 제품의 주장이므로
 * 사람이 판정 버튼을 한 번 더 누르게 하지 않는다.
 */
export async function submitRequest(projectId: string, _prev: RequestState, form: FormData): Promise<RequestState> {
  const actor = await actorOf(projectId);

  const title = String(form.get('title') ?? '').trim();
  const agendaLines = String(form.get('agenda') ?? '')
    .split('\n').map((s) => s.replace(/^[-*•\d.)\s]+/, '').trim()).filter(Boolean).slice(0, 20);
  const outcomeText = String(form.get('outcome') ?? '').trim();
  const marker = String(form.get('marker') ?? '').trim();
  const minutes = Number(form.get('minutes') ?? 30);
  const whenRaw = String(form.get('scheduled_at') ?? '').trim();
  // 체크박스라 같은 name 으로 여러 값이 온다. 목록에서 고른 이름이므로
  // 주입 기록(injections.member)과 글자가 어긋나지 않는다.
  const attendees = form.getAll('attendees')
    .map((v) => String(v).trim()).filter(Boolean);
  // 선택 입력. 비어 있는 것이 기본이고, 비어도 참석자 축으로 근거가 붙는다.
  const scopeInput = String(form.get('scope') ?? '').trim();
  // 원인 후보 — 커넥터가 줄 수 없는 값이라 사람에게 받는다.
  const leadingHypothesis = String(form.get('leading_hypothesis') ?? '').trim();
  const openHypotheses = String(form.get('open_hypotheses') ?? '')
    .split('\n').map((s) => s.replace(/^[-*•\d.)\s]+/, '').trim()).filter(Boolean).slice(0, 10);

  if (!title) return { error: '제목을 입력해주세요.' };
  if (agendaLines.length === 0 && !outcomeText) {
    return { error: '안건이나 산출물 중 하나는 적어주세요. 둘 다 없으면 판정할 수 없습니다.' };
  }

  const scheduledAt = whenRaw
    ? new Date(whenRaw).toISOString()
    : new Date(Date.now() + 24 * 3_600_000).toISOString();

  const id = rid('rq');

  const data = await loadNoMeeting(projectId);

  // 표식이 있으면 분류기를 부르지 않는다. T5·T6 은 본문을 읽지 않는 유형이고,
  // 읽지 않겠다고 한 것을 LLM 에 보내면 그 약속이 깨진다.
  const explicitTypeMarker = MARKERS[marker] ?? null;
  let cls;
  if (explicitTypeMarker) {
    cls = {
      ...UNCLASSIFIABLE,
      typeCandidates: [{ type: explicitTypeMarker, score: 1 }],
      typeRationale: MARKER_REASON[marker] ?? '신청자가 유형을 표시했습니다.',
    };
  } else {
    try {
      cls = await classifyRequest({ title, agendaLines, outcomeText });
    } catch {
      // 분류기가 죽어도 판정은 멈추지 않는다. 유형 미상으로 사람에게 되묻는다.
      cls = UNCLASSIFIABLE;
    }
  }

  const request: MeetingRequest = {
    id,
    source: 'REQUEST',
    title,
    purposeText: [agendaLines.map((l) => `· ${l}`).join('\n'), outcomeText && `→ ${outcomeText}`]
      .filter(Boolean).join('\n\n'),
    scheduledAt,
    requestedBy: actor,
    attendeeCandidates: attendees.length > 0 ? attendees : [actor],
    plannedMinutes: Number.isFinite(minutes) && minutes > 0 ? Math.min(480, minutes) : 30,
    createdAt: new Date().toISOString(),
    agenda: cls.agenda,
    typeCandidates: cls.typeCandidates,
    typeRationale: cls.typeRationale,
    explicitTypeMarker,
    patternKey: cls.patternKey,
    // 신청자에게 요구하지 않는다 — 이미 적혀 있으면 뽑고, 따로 적어 줬으면 더한다.
    scopeKeys: mergeScopeKeys(
      // 신청서는 전부 문장이다. 적혀 있는 이슈키만 뽑고, 서비스 이름은 아래 선택 입력으로만 받는다.
      extractRefKeys([title, ...agendaLines, outcomeText].join(' ')),
      parseScopeInput(scopeInput),
    ),
  };

  // 이 요청에 실제로 걸리는 근거만 고른다.
  const { evidence: bound, dropped } = pickEvidenceFor(request, data);

  /**
   * 신청자가 적은 원인 후보를 근거 한 줄로 만든다.
   *
   * 커넥터가 준 사실과 **같은 줄에 서지만 성격이 다르다** — 남의 시스템이 확인해 준
   * 것이 아니라 사람의 주장이다. 그래서 `source: 'REQUEST'` 로 표시하고 화면에서 구분한다.
   * 대신 이 값이 있어야 T3 의 원인 조건을 검사할 수 있다. 없으면 UNKNOWN 이고,
   * 그 자리에서 AI 가 원인을 골라 주지 않는다.
   */
  const evidence = leadingHypothesis
    ? [...bound, {
        id: `ev-hyp-${id}`,
        source: 'REQUEST' as const,
        sourceRef: `request:${id}`,
        kind: 'AGENDA' as const,
        summary: openHypotheses.length > 0
          ? `신청자가 적은 원인 후보 — 유력: ${leadingHypothesis} / 배제 못함: ${openHypotheses.join(' · ')}`
          : `신청자가 적은 원인 후보 — 유력: ${leadingHypothesis} (배제 못한 후보 없음)`,
        observedAt: new Date().toISOString(),
        facts: { leadingHypothesis, openHypotheses, owner: actor },
        boundVia: 'SCOPE' as const,
        boundReason: '이 신청서에 직접 적힌 내용입니다.',
      }]
    : bound;
  request.agenda = linkEvidence(request.agenda, evidence);

  const ev = evaluate({
    request,
    evidence,
    droppedSources: dropped,
    activePolicies: data.policies,
    responseStats: data.responseStats,
    now: Date.now(),
    id: rid('ev'),
  });

  await persistEvaluation(projectId, request, ev);
  revalidatePath(`/p/${projectId}/no-meeting`);
  redirect(`/p/${projectId}/no-meeting/e/${ev.id}?fresh=1`);
}

/** 큐에 있는 요청을 판정한다. */
export async function runEvaluation(projectId: string, requestId: string) {
  await actorOf(projectId);
  const data = await loadNoMeeting(projectId);
  const request = data.requests.find((r) => r.id === requestId);

  // 버튼을 두 번 누르면 두 번째는 큐에서 사라진 요청을 찾는다. 조용히 넘기지 말고
  // 이미 만들어진 판정으로 보낸다 — 아무 일도 일어나지 않은 화면이 더 나쁘다.
  if (!request) {
    const done = await serverClient()
      .from('evaluations').select('id')
      .eq('project_id', projectId).eq('request_id', requestId)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (done.data?.id) redirect(`/p/${projectId}/no-meeting/e/${done.data.id}`);
    return;
  }

  const { evidence, dropped } = pickEvidenceFor(request, data);
  const ev = evaluate({
    request,
    evidence,
    droppedSources: dropped,
    activePolicies: data.policies,
    responseStats: data.responseStats,
    now: Date.now(),
    id: rid('ev'),
  });

  await persistEvaluation(projectId, request, ev);
  revalidatePath(`/p/${projectId}/no-meeting`);
  redirect(`/p/${projectId}/no-meeting/e/${ev.id}?fresh=1`);
}

/**
 * 이 요청에 걸리는 근거를 고른다.
 *
 * 큐에 있던 요청은 `loadNoMeeting` 이 이미 붙여 뒀다. 방금 낸 신청서는 그 맵에
 * 없으므로 여기서 같은 함수로 붙인다 — **두 경로가 다른 규칙을 쓰면 안 된다.**
 */
function pickEvidenceFor(
  request: MeetingRequest,
  data: Awaited<ReturnType<typeof loadNoMeeting>>,
) {
  const cached = data.evidenceByRequest[request.id];
  if (cached) return { evidence: cached, dropped: data.droppedByRequest[request.id] ?? [] };

  const connected = new Set(
    (Object.keys(data.connections) as ConnectorId[])
      .filter((id) => data.connections[id].status === 'CONNECTED'),
  );
  const now = Date.now();

  const bound = bindEvidence(request, data.connectorEvidence, now);
  return {
    evidence: bound.filter((e) => !isConnectorSource(e.source) || connected.has(e.source)),
    dropped: [...new Set(
      bound.map((e) => e.source)
        .filter((src): src is ConnectorId => isConnectorSource(src) && !connected.has(src)),
    )],
  };
}

// ── 결정 ──────────────────────────────────────────────────────────
export async function decide(projectId: string, evaluationId: string, optionKey: string) {
  const actor = await actorOf(projectId);
  const db = serverClient();

  const { data: row } = await db.from('evaluations').select('payload, decision_status')
    .eq('id', evaluationId).maybeSingle();
  if (!row || row.decision_status !== 'PENDING') return;

  const ev = row.payload as Evaluation;
  if (ev.artifact?.type !== 'DECISION_CARD') return;
  const option = ev.artifact.content.options.find((o) => o.key === optionKey);
  if (!option) return;

  const next: Evaluation = { ...ev, decisionStatus: 'DECIDED', selectedOptionKey: optionKey };
  await db.from('evaluations').update({
    decision_status: 'DECIDED', selected_option_key: optionKey, payload: next,
  }).eq('id', evaluationId);

  await db.from('decisions').update({ status: 'resolved', resolved_choice: option.label })
    .eq('evaluation_id', evaluationId);

  await insertLedger(projectId, {
    id: rid('lg'), eventType: 'DECIDED', outcome: 'DECIDE', actor,
    title: ev.title, summary: `“${option.label}” 을 선택했습니다.`,
    occurredAt: new Date().toISOString(), evaluationId, ruleVersion: RULE_VERSION,
    patternKey: ev.patternKey ?? null, selectedOptionKey: optionKey,
  });

  revalidatePath(`/p/${projectId}/no-meeting`);
}

export async function revert(projectId: string, evaluationId: string, reason: string) {
  const actor = await actorOf(projectId);
  const db = serverClient();

  const { data: row } = await db.from('evaluations').select('payload, decision_status')
    .eq('id', evaluationId).maybeSingle();
  if (!row || row.decision_status !== 'DECIDED') return;

  const ev = row.payload as Evaluation;
  const next: Evaluation = { ...ev, decisionStatus: 'REVERTED', revertReason: reason };
  await db.from('evaluations').update({ decision_status: 'REVERTED', payload: next })
    .eq('id', evaluationId);

  // 기존 기록을 지우지 않는다. 이벤트를 하나 더 붙일 뿐이다.
  await insertLedger(projectId, {
    id: rid('lg'), eventType: 'REVERTED', outcome: 'DECIDE', actor,
    title: ev.title, summary: `되돌림 — ${reason}`,
    occurredAt: new Date().toISOString(), evaluationId, ruleVersion: RULE_VERSION,
    patternKey: ev.patternKey ?? null, selectedOptionKey: ev.selectedOptionKey ?? null,
  });

  revalidatePath(`/p/${projectId}/no-meeting`);
}

// ── 정책 승격 ─────────────────────────────────────────────────────
/** 규칙 문안은 사람이 쓴다. 반복을 센 것은 시스템이지만, 무엇을 규칙으로 삼을지는 아니다. */
export async function activatePolicy(projectId: string, form: FormData) {
  const actor = await actorOf(projectId);
  const patternKey = String(form.get('pattern_key') ?? '');
  const optionKey = String(form.get('option_key') ?? '');
  const title = String(form.get('title') ?? '').trim();
  const rule = String(form.get('rule') ?? '').trim();
  const exception = String(form.get('exception') ?? '').trim() || null;
  if (!patternKey || !optionKey || !title || !rule) return;

  const at = new Date().toISOString();
  await serverClient().from('nm_policies').upsert({
    id: rid('pol'), project_id: projectId, pattern_key: patternKey,
    selected_option_key: optionKey, title, rule, exception,
    activated_by: actor, activated_at: at,
  }, { onConflict: 'project_id,pattern_key,selected_option_key' });

  await insertLedger(projectId, {
    id: rid('lg'), eventType: 'POLICY_ACTIVATED', outcome: null, actor,
    title: `정책 등록 — ${title}`, summary: rule, occurredAt: at,
    evaluationId: null, ruleVersion: RULE_VERSION, patternKey,
  });

  revalidatePath(`/p/${projectId}/no-meeting`);
}

// ── 연결 ──────────────────────────────────────────────────────────
export async function setConnection(
  projectId: string, connectorId: string, connect: boolean, accountLabel?: string,
) {
  await actorOf(projectId);
  const at = new Date().toISOString();
  await serverClient().from('nm_connections').upsert({
    project_id: projectId,
    connector_id: connectorId,
    status: connect ? 'CONNECTED' : 'DISCONNECTED',
    account_label: connect ? (accountLabel ?? null) : null,
    connected_at: connect ? at : null,
    last_sync_at: connect ? at : null,
  }, { onConflict: 'project_id,connector_id' });
  revalidatePath(`/p/${projectId}/no-meeting`);
}

// ── 이슈트래커 연결 ────────────────────────────────────────────────
/**
 * 붙여넣은 값으로 **실제로 읽히는지 먼저 확인하고** 저장한다.
 *
 * 확인 없이 CONNECTED 로 저장하면 화면은 연결됐다고 하고 판정은 근거 없이
 * UNKNOWN 을 낸다. 이 제품에서 제일 나쁜 상태다 — 사람은 시스템이 봤다고 믿는데
 * 실제로는 아무것도 안 봤고, 화면 어디에도 그 사실이 안 적힌다.
 */
export type ConnectorConnectState = {
  error?: string;
  ok?: boolean;
  /** 매핑 화면에 채울 저쪽 시스템의 이름들 */
  people?: string[];
  /** 읽을 수 있는 프로젝트. 두 커넥터가 같은 화면을 쓰므로 모양을 맞춰 둔다. */
  projects?: { id: string; name: string }[];
};

export async function connectJira(
  projectId: string, _prev: ConnectorConnectState, form: FormData,
): Promise<ConnectorConnectState> {
  await actorOf(projectId);

  const host = String(form.get('host') ?? '').trim()
    .replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const email = String(form.get('email') ?? '').trim();
  const apiToken = String(form.get('token') ?? '').trim();
  const projectKeys = String(form.get('projects') ?? '')
    .split(/[,\s]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);

  if (!host || !email || !apiToken) {
    return { error: '도메인 · 이메일 · API 토큰을 모두 입력해주세요.' };
  }

  const cfg: JiraConfig = { host, email, apiToken, projectKeys, identityMap: {} };
  const verified = await verifyJira(cfg);
  if (!verified.ok) return { error: verified.error };

  // 프로젝트를 안 골랐으면 읽을 수 있는 것 전부. 화면에 그대로 표시된다.
  const keys = projectKeys.length > 0 ? projectKeys : verified.projects.map((p) => p.key);
  const existing = await readConfig(projectId, 'jira');

  await writeConfig(projectId, 'jira', {
    ...cfg,
    projectKeys: keys,
    // 이미 맞춰 둔 사람 매핑은 재연결해도 지우지 않는다.
    identityMap: existing?.identityMap ?? {},
  } satisfies JiraConfig);

  await setConnection(projectId, 'jira', true, `${verified.accountLabel} · ${keys.join(' ')}`);
  revalidatePath(`/p/${projectId}/no-meeting/connections`);
  return {
    ok: true, people: verified.people,
    projects: verified.projects.map((p) => ({ id: p.key, name: p.name })),
  };
}

/**
 * 사람 매핑 저장.
 *
 * **이 값이 비면 "부른 사람" 축이 통째로 죽는다.** 이름이 한 글자만 달라도 근거가
 * 0건이 되고, 화면에는 "근거 없음 → 확인 불가" 로만 보여 원인을 알 수 없다.
 * 그래서 연결과 같은 화면에 두고, 안 맞춘 사람이 몇 명인지 세어 보여준다.
 */
export async function saveJiraIdentities(projectId: string, form: FormData) {
  await actorOf(projectId);
  const cfg = await readConfig(projectId, 'jira');
  if (!cfg) return;

  const identityMap: Record<string, string> = {};
  for (const [k, v] of form.entries()) {
    if (!k.startsWith('id:')) continue;
    const theirName = k.slice(3);
    const ours = String(v).trim();
    if (theirName && ours) identityMap[theirName] = ours;
  }

  await writeConfig(projectId, 'jira', { ...cfg, identityMap });
  revalidatePath(`/p/${projectId}/no-meeting/connections`);
}

/** 연결을 끊으면 자격증명도 지운다. 상태만 바꾸고 토큰을 남겨 두지 않는다. */
export async function disconnectConnector(projectId: string, connectorId: ConnectorId) {
  await actorOf(projectId);
  await deleteConfig(projectId, connectorId);
  await setConnection(projectId, connectorId, false);
}

// ── 장애 알림 연결 ─────────────────────────────────────────────────
/** Jira 와 같은 틀이다 — 저장 전에 실제로 읽히는지 확인하고, 사람 매핑을 같이 받는다. */
export async function connectSentry(
  projectId: string, _prev: ConnectorConnectState, form: FormData,
): Promise<ConnectorConnectState> {
  await actorOf(projectId);

  const baseUrl = (String(form.get('base_url') ?? '').trim() || 'https://sentry.io')
    .replace(/\/+$/, '');
  const org = String(form.get('org') ?? '').trim();
  const authToken = String(form.get('token') ?? '').trim();
  const projectSlugs = String(form.get('projects') ?? '')
    .split(/[,\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);

  if (!org || !authToken) return { error: '조직 슬러그와 토큰을 입력해주세요.' };

  const cfg: SentryConfig = { baseUrl, org, authToken, projectSlugs, identityMap: {} };
  const verified = await verifySentry(cfg);
  if (!verified.ok) return { error: verified.error };

  const slugs = projectSlugs.length > 0 ? projectSlugs : verified.projects.map((p) => p.slug);
  const existing = await readConfig(projectId, 'alerts');

  await writeConfig(projectId, 'alerts', {
    ...cfg, projectSlugs: slugs, identityMap: existing?.identityMap ?? {},
  } satisfies SentryConfig);

  await setConnection(projectId, 'alerts', true, `${verified.orgLabel} · ${slugs.join(' ')}`);
  revalidatePath(`/p/${projectId}/no-meeting/connections`);
  return {
    ok: true, people: verified.people,
    projects: verified.projects.map((p) => ({ id: p.slug, name: p.name })),
  };
}

export async function saveSentryIdentities(projectId: string, form: FormData) {
  await actorOf(projectId);
  const cfg = await readConfig(projectId, 'alerts');
  if (!cfg) return;

  const identityMap: Record<string, string> = {};
  for (const [k, v] of form.entries()) {
    if (!k.startsWith('id:')) continue;
    const theirName = k.slice(3);
    const ours = String(v).trim();
    if (theirName && ours) identityMap[theirName] = ours;
  }
  await writeConfig(projectId, 'alerts', { ...cfg, identityMap });
  revalidatePath(`/p/${projectId}/no-meeting/connections`);
}
