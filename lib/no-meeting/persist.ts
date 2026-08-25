import { randomBytes } from 'node:crypto';
import { serverClient } from '../supabase';
import { RULE_VERSION } from './settings';
import type { Evaluation, LedgerEntry, MeetingRequest } from './types';

/**
 * 판정을 DB 에 앉히는 유일한 경로.
 *
 * 신청서에서 온 판정과 자동 재판정이 같은 함수를 쓴다 — 원장에 남는 모양이
 * 경로마다 다르면 "당시 무엇을 보고 그렇게 판정했나" 를 되짚을 수 없다.
 *
 * 실패를 삼키지 않는다. 판정 저장이 실패했는데 원장만 남으면 원장이 존재하지 않는
 * 판정을 가리키고, "없앴다가 사고가 나면 되짚는다" 는 약속이 그 자리에서 깨진다.
 * 실제로 한 번 그렇게 됐다 — 판정 insert 가 조용히 실패하고 원장 행만 남았다.
 */

function must(what: string, res: { error: { message: string } | null }) {
  if (res.error) throw new Error(`${what} 실패: ${res.error.message}`);
}

export const newId = (p: string) => `${p}-${randomBytes(6).toString('hex')}`;

/** 판정 한 건을 DB 에 앉힌다 — 판정 · 원장 · (결정 카드면) 결정 인박스까지 한 번에. */
export async function persistEvaluation(
  projectId: string, req: MeetingRequest, ev: Evaluation,
  /** 재판정처럼 무엇이 바뀌었는지를 원장에 적어야 할 때 문장을 넘긴다. */
  ledgerSummary?: string,
) {
  const db = serverClient();

  must('요청 저장', await db.from('meeting_requests').upsert({
    id: req.id,
    project_id: projectId,
    source: req.source,
    title: req.title,
    purpose_text: req.purposeText,
    scheduled_at: req.scheduledAt,
    requested_by: req.requestedBy,
    attendee_candidates: req.attendeeCandidates,
    planned_minutes: req.plannedMinutes,
    scope_keys: req.scopeKeys,
    agenda: req.agenda,
    type_candidates: req.typeCandidates,
    type_rationale: req.typeRationale,
    explicit_type_marker: req.explicitTypeMarker,
    pattern_key: req.patternKey,
    status: 'EVALUATED',
  }));

  must('판정 저장', await db.from('evaluations').insert({
    id: ev.id,
    project_id: projectId,
    request_id: req.id,
    meeting_type: ev.meetingType,
    outcome: ev.outcome,
    decision_status: ev.decisionStatus ?? null,
    pattern_key: ev.patternKey,
    selected_option_key: null,
    rule_version: RULE_VERSION,
    payload: ev,
  }));

  const passed = ev.gateChecks.filter((g) => g.status === 'PASS').length;
  const entry: LedgerEntry = {
    id: newId('lg'),
    eventType: 'EVALUATED',
    outcome: ev.outcome,
    actor: '시스템',
    title: ev.title,
    summary: ledgerSummary ?? (ev.outcome
      ? `${ev.meetingType} · 조건 ${passed}/${ev.gateChecks.length} 충족`
      : '유형을 확정하지 못해 목적을 되물었습니다.'),
    occurredAt: ev.requestedAt,
    evaluationId: ev.id,
    ruleVersion: RULE_VERSION,
  };
  await insertLedger(projectId, entry);

  // M3 · 결정 카드는 기존 결정 인박스에 그대로 들어간다. 인박스가 둘이면
  // "사람에게 올린다" 가 성립하지 않는다.
  if (ev.artifact?.type === 'DECISION_CARD') {
    const c = ev.artifact.content;
    must('결정 인박스 등록', await db.from('decisions').insert({
      project_id: projectId,
      question: c.question,
      options: c.options.map((o) => ({
        label: o.label,
        rationale: [...o.pros.map((p) => `+ ${p}`), ...o.cons.map((x) => `− ${x}`)].join(' · '),
      })),
      status: 'open',
      evaluation_id: ev.id,
      why_you: c.whyYou,
      decider: c.decider.member,
      due_at: c.dueAt,
    }));
  }
}

export async function insertLedger(projectId: string, e: LedgerEntry) {
  must('원장 기록', await serverClient().from('nm_ledger').insert({
    id: e.id, project_id: projectId, event_type: e.eventType, outcome: e.outcome,
    actor: e.actor, title: e.title, summary: e.summary, occurred_at: e.occurredAt,
    evaluation_id: e.evaluationId, rule_version: e.ruleVersion,
    pattern_key: e.patternKey ?? null, selected_option_key: e.selectedOptionKey ?? null,
  }));
}

