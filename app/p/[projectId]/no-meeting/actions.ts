'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { serverClient } from '@/lib/supabase';
import { currentUser, membershipOf } from '@/lib/auth-server';
import { classifyRequest, linkEvidence, UNCLASSIFIABLE } from '@/lib/no-meeting/classify';
import { demoEvidence, demoRequests } from '@/lib/no-meeting/demo';
import { evaluate } from '@/lib/no-meeting/engine';
import { insertLedger, newId, persistEvaluation } from '@/lib/no-meeting/persist';
import { loadNoMeeting } from '@/lib/no-meeting/queries';
import { RULE_VERSION } from '@/lib/no-meeting/settings';
import type { Evaluation, MeetingRequest, MeetingType } from '@/lib/no-meeting/types';

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
  };

  // 이 요청에 실제로 걸리는 근거만 고른다.
  const { evidence, dropped } = pickEvidenceFor(request, data);
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

/** 큐에 있는 요청(캘린더에서 온 것 포함)을 판정한다. */
export async function runEvaluation(projectId: string, requestId: string) {
  await actorOf(projectId);
  const data = await loadNoMeeting(projectId);
  const request = data.requests.find((r) => r.id === requestId)
    ?? demoRequests(Date.now()).find((r) => r.id === requestId);

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

function pickEvidenceFor(
  request: MeetingRequest,
  data: Awaited<ReturnType<typeof loadNoMeeting>>,
) {
  const evidence = data.evidenceByRequest[request.id]
    ?? demoEvidence(Date.now())[request.id]
    ?? [];
  const dropped = data.droppedByRequest[request.id] ?? [];
  return { evidence, dropped };
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
