import { serverClient } from '../supabase';
import type { ResponseStats } from './engine';
import { CONNECTORS, isConnectorSource, seedConnections } from './connectors';
import { loadTeamSyncEvidence } from './evidence-teamsync';
import { loadJiraEvidence } from './connect/jira';
import { loadSentryEvidence } from './connect/sentry';
import { readConfig } from './connect/store';
import { bindEvidence } from './scope';
import { POLICY_THRESHOLD } from './settings';
import type {
  ConnectionState, ConnectorId, Evaluation, Evidence, LedgerEntry, MeetingRequest, Policy,
} from './types';

/**
 * NO MEETING 화면 한 벌.
 *
 * 큐에 들어오는 것은 하나뿐이다 — **사람이 낸 신청서(DB).**
 * 예전에는 캘린더 몫의 데모 요청이 코드에서 얹혔는데, 그러면 커넥터를 연결한
 * 것처럼 보이는 자리에 실제로는 하드코딩된 요청이 들어와 있었다.
 * 데모는 `npm run seed:no-meeting` 이 DB 에 실제 행으로 넣는다.
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
  /** 연결된 커넥터가 준 근거 전체 (아직 어느 요청에도 안 붙은 상태). 방금 낸 신청서가 여기서 붙는다. */
  connectorEvidence: Evidence[];
};

export async function loadNoMeeting(projectId: string): Promise<NoMeetingData> {
  const db = serverClient();
  const now = Date.now();

  const [reqRes, evalRes, ledRes, polRes, connRes, teamsync, jiraCfg, alertCfg] = await Promise.all([
    db.from('meeting_requests').select('*').eq('project_id', projectId)
      .eq('status', 'PENDING').order('scheduled_at', { ascending: true }),
    db.from('evaluations').select('payload').eq('project_id', projectId)
      .order('created_at', { ascending: false }).limit(50),
    db.from('nm_ledger').select('*').eq('project_id', projectId)
      .order('occurred_at', { ascending: false }).limit(100),
    db.from('nm_policies').select('*').eq('project_id', projectId),
    db.from('nm_connections').select('*').eq('project_id', projectId),
    loadTeamSyncEvidence(projectId).catch(() => ({ evidence: [], members: [] })),
    readConfig(projectId, 'jira').catch(() => null),
    readConfig(projectId, 'alerts').catch(() => null),
  ]);

  /**
   * 이슈트래커 근거. 읽기에 실패하면 **빈 배열로 떨어뜨린다** — 판정을 멈추지 않는다.
   * 근거가 없으면 게이트가 UNKNOWN 이 되고, UNKNOWN 이면 회의를 삭제하지 않는다.
   * 즉 실패의 방향이 안전한 쪽이라 여기서 예외를 위로 던지지 않는다.
   */
  const [jiraEvidence, alertEvidence] = await Promise.all([
    jiraCfg ? loadJiraEvidence(jiraCfg).catch(() => [] as Evidence[]) : Promise.resolve([]),
    alertCfg ? loadSentryEvidence(alertCfg).catch(() => [] as Evidence[]) : Promise.resolve([]),
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
    source: 'REQUEST',
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
    scopeKeys: r.scope_keys ?? [],
  }));

  const requests = [...submitted].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));

  // ── 근거 ───────────────────────────────────────────────────────
  const evidenceByRequest: Record<string, Evidence[]> = {};
  const droppedByRequest: Record<string, ConnectorId[]> = {};
  const allEvidence = [...teamsync.evidence, ...jiraEvidence, ...alertEvidence];

  for (const req of requests) {
    // 끊긴 소스의 사실은 애초에 후보에 넣지 않는다. 연결이 곧 사정거리다.
    const pool = allEvidence.filter((e) => !isConnectorSource(e.source) || connected.has(e.source));
    evidenceByRequest[req.id] = bindEvidence(req, pool, now);

    // 끊겨 있지 않았다면 이 요청에 붙었을 소스. 화면이 "무엇을 못 봤는지" 를 말할 수 있어야 한다.
    droppedByRequest[req.id] = [...new Set(
      bindEvidence(req, allEvidence, now).map((e) => e.source)
        .filter((src): src is ConnectorId => isConnectorSource(src) && !connected.has(src)),
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
    connectorEvidence: [...teamsync.evidence, ...jiraEvidence, ...alertEvidence],
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
