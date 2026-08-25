import { serverClient } from '../supabase';
import type { ResponseStats } from './engine';
import { CONNECTORS, seedConnections } from './connectors';
import { demoEvidence, demoRequests } from './demo';
import { loadTeamSyncEvidence } from './evidence-teamsync';
import { POLICY_THRESHOLD } from './settings';
import type {
  ConnectionState, ConnectorId, Evaluation, Evidence, LedgerEntry, MeetingRequest, Policy,
} from './types';

/**
 * NO MEETING 화면 한 벌.
 *
 * 큐에는 두 출처가 섞인다 — 사람이 올린 신청서(DB)와 아직 실물이 없는
 * 캘린더 몫의 데모 요청. 데모 쪽은 `source: 'CALENDAR'` 로 표시되어 화면에서
 * 구분된다. 캘린더 커넥터가 붙는 날 `demoRequests` 만 지우면 된다.
 */

export type PolicyCandidate = {
  patternKey: string;
  selectedOptionKey: string;
  decisionCount: number;
  threshold: number;
  sourceDecisions: { id: string; date: string; title: string }[];
};

export type NoMeetingData = {
  /** 원장에서 센 사람별 결정 응답 시간 */
  responseStats: ResponseStats;
  requests: MeetingRequest[];
  evaluations: Evaluation[];
  ledger: LedgerEntry[];
  policies: Policy[];
  candidates: PolicyCandidate[];
  connections: Record<ConnectorId, ConnectionState>;
  /** 요청 id → 그 판정에 쓸 근거 */
  evidenceByRequest: Record<string, Evidence[]>;
  droppedByRequest: Record<string, ConnectorId[]>;
};

const tokenize = (s: string) =>
  new Set(s.toLowerCase().split(/[^a-z0-9가-힣]+/).filter((w) => w.length >= 2));

/**
 * 요청 하나에 붙일 근거를 고른다.
 *
 * 안건·제목과 실제로 단어가 겹치는 근거만 붙인다. 겹치는 것이 없으면 근거가
 * 얇은 채로 판정되고, 게이트는 UNKNOWN 이 되어 회의를 삭제하지 않는다.
 * 관련 없는 근거를 끌어다 붙여 조건을 통과시키는 것보다 그편이 낫다.
 */
function selectEvidence(req: MeetingRequest, pool: Evidence[]): Evidence[] {
  const words = tokenize([req.title, ...req.agenda.map((a) => a.title)].join(' '));
  return pool.filter((e) => {
    const et = tokenize(`${e.summary} ${e.sourceRef}`);
    let overlap = 0;
    for (const w of words) if (et.has(w)) overlap += 1;
    return overlap >= 2;
  });
}

export async function loadNoMeeting(projectId: string): Promise<NoMeetingData> {
  const db = serverClient();
  const now = Date.now();

  const [reqRes, evalRes, ledRes, polRes, connRes, teamsync] = await Promise.all([
    db.from('meeting_requests').select('*').eq('project_id', projectId)
      .eq('status', 'PENDING').order('scheduled_at', { ascending: true }),
    db.from('evaluations').select('payload').eq('project_id', projectId)
      .order('created_at', { ascending: false }).limit(50),
    db.from('nm_ledger').select('*').eq('project_id', projectId)
      .order('occurred_at', { ascending: false }).limit(100),
    db.from('nm_policies').select('*').eq('project_id', projectId),
    db.from('nm_connections').select('*').eq('project_id', projectId),
    loadTeamSyncEvidence(projectId).catch(() => ({ evidence: [], members: [] })),
  ]);

  // ── 연결 상태 ──────────────────────────────────────────────────
  const seeded = seedConnections(now);
  const connections = { ...seeded };
  for (const row of connRes.data ?? []) {
    const id = row.connector_id as ConnectorId;
    if (!(id in connections)) continue;
    connections[id] = {
      status: row.status === 'CONNECTED' ? 'CONNECTED' : 'DISCONNECTED',
      accountLabel: row.account_label,
      connectedAt: row.connected_at,
      lastSyncAt: row.last_sync_at,
    };
  }
  const connected = new Set(
    CONNECTORS.map((c) => c.id).filter((id) => connections[id].status === 'CONNECTED'),
  );

  // ── 큐 ─────────────────────────────────────────────────────────
  const submitted: MeetingRequest[] = (reqRes.data ?? []).map((r) => ({
    id: r.id,
    source: r.source === 'CALENDAR' ? 'CALENDAR' : 'REQUEST',
    title: r.title,
    purposeText: r.purpose_text,
    scheduledAt: r.scheduled_at,
    requestedBy: r.requested_by,
    attendeeCandidates: r.attendee_candidates ?? [],
    plannedMinutes: r.planned_minutes,
    createdAt: r.created_at,
    agenda: r.agenda ?? [],
    typeCandidates: r.type_candidates ?? [],
    typeRationale: r.type_rationale,
    explicitTypeMarker: r.explicit_type_marker ?? null,
    patternKey: r.pattern_key ?? null,
  }));

  // 캘린더가 연결돼 있을 때만 데모 요청이 큐에 들어온다.
  const calendarDemo = connected.has('calendar') ? demoRequests(now) : [];
  const requests = [...submitted, ...calendarDemo]
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));

  // ── 근거 ───────────────────────────────────────────────────────
  const demoPool = demoEvidence(now);
  const evidenceByRequest: Record<string, Evidence[]> = {};
  const droppedByRequest: Record<string, ConnectorId[]> = {};

  for (const req of requests) {
    const pool: Evidence[] = [
      ...(connected.has('teamsync') ? teamsync.evidence : []),
      ...(demoPool[req.id] ?? []),
    ];
    const picked = req.source === 'CALENDAR'
      // 데모 요청은 자기 몫 근거를 그대로 쓴다 (그 커넥터가 준 것으로 가정)
      ? [...(demoPool[req.id] ?? []), ...selectEvidence(req, connected.has('teamsync') ? teamsync.evidence : [])]
      : selectEvidence(req, pool);

    evidenceByRequest[req.id] = picked.filter((e) => e.source === 'POLICY' || connected.has(e.source));
    droppedByRequest[req.id] = [...new Set(
      picked.map((e) => e.source)
        .filter((s): s is ConnectorId => s !== 'POLICY' && !connected.has(s)),
    )];
  }

  // ── 판정 · 원장 ────────────────────────────────────────────────
  const evaluations = (evalRes.data ?? []).map((r) => r.payload as Evaluation);
  const ledger: LedgerEntry[] = (ledRes.data ?? []).map((r) => ({
    id: r.id, eventType: r.event_type, outcome: r.outcome, actor: r.actor,
    title: r.title, summary: r.summary, occurredAt: r.occurred_at,
    evaluationId: r.evaluation_id, ruleVersion: r.rule_version,
    patternKey: r.pattern_key, selectedOptionKey: r.selected_option_key,
  }));

  // ── 정책 ───────────────────────────────────────────────────────
  const policies: Policy[] = (polRes.data ?? []).map((p) => ({
    id: p.id, patternKey: p.pattern_key, selectedOptionKey: p.selected_option_key,
    status: 'ACTIVE', title: p.title, rule: p.rule, exception: p.exception,
    decisionCount: 0, threshold: POLICY_THRESHOLD, sourceDecisions: [],
    activatedBy: p.activated_by, activatedAt: p.activated_at,
  }));

  return {
    requests, evaluations, ledger, policies,
    candidates: findCandidates(ledger, policies),
    responseStats: responseStats(ledger),
    connections, evidenceByRequest, droppedByRequest,
  };
}

/**
 * 정책 후보는 저장하지 않는다. 원장에서 센다.
 * 되돌린 결정은 빼고 센다 — 잘못된 판단이 정책으로 굳는 것을 막는 규칙이다.
 */
export function findCandidates(ledger: LedgerEntry[], policies: Policy[]): PolicyCandidate[] {
  const reverted = new Set(
    ledger.filter((l) => l.eventType === 'REVERTED' && l.evaluationId).map((l) => l.evaluationId),
  );
  const existing = new Set(policies.map((p) => `${p.patternKey}::${p.selectedOptionKey}`));
  const byKey = new Map<string, LedgerEntry[]>();

  for (const l of ledger) {
    if (l.eventType !== 'DECIDED' || !l.patternKey || !l.selectedOptionKey) continue;
    if (l.evaluationId && reverted.has(l.evaluationId)) continue;
    const key = `${l.patternKey}::${l.selectedOptionKey}`;
    if (existing.has(key)) continue;
    byKey.set(key, [...(byKey.get(key) ?? []), l]);
  }

  return [...byKey.entries()]
    .map(([key, entries]) => {
      const [patternKey, selectedOptionKey] = key.split('::');
      return {
        patternKey, selectedOptionKey,
        decisionCount: entries.length,
        threshold: POLICY_THRESHOLD,
        sourceDecisions: entries.map((e) => ({
          id: e.id, date: e.occurredAt.slice(0, 10), title: e.title,
        })),
      };
    })
    .sort((a, b) => b.decisionCount - a.decisionCount);
}

/** 판정 한 건. 스냅샷이므로 저장된 payload 를 그대로 돌려준다. */
export async function loadEvaluation(projectId: string, id: string): Promise<Evaluation | null> {
  const { data } = await serverClient()
    .from('evaluations').select('payload')
    .eq('project_id', projectId).eq('id', id).maybeSingle();
  return (data?.payload as Evaluation) ?? null;
}

/**
 * 사람마다 결정에 답하기까지 실제로 걸린 시간.
 *
 * 추정이 아니라 원장에서 센 값이다 — 같은 판정의 EVALUATED 와 DECIDED 시각 차.
 * 평균이 아니라 중앙값을 쓴다. 한 번 오래 걸린 건이 전체를 흔들면 안 된다.
 */
export function responseStats(ledger: LedgerEntry[]): ResponseStats {
  const raisedAt = new Map<string, string>();
  for (const l of ledger) {
    if (l.eventType === 'EVALUATED' && l.evaluationId) raisedAt.set(l.evaluationId, l.occurredAt);
  }

  const byMember = new Map<string, number[]>();
  for (const l of ledger) {
    if (l.eventType !== 'DECIDED' || !l.evaluationId) continue;
    const raised = raisedAt.get(l.evaluationId);
    if (!raised) continue;
    const hours = (new Date(l.occurredAt).getTime() - new Date(raised).getTime()) / 3_600_000;
    if (hours < 0) continue;
    byMember.set(l.actor, [...(byMember.get(l.actor) ?? []), hours]);
  }

  const out: ResponseStats = {};
  for (const [member, list] of byMember) {
    const sorted = [...list].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
    out[member] = { medianHours: Math.round(median * 10) / 10, count: sorted.length };
  }
  return out;
}
