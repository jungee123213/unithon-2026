/**
 * 판정 규칙 회귀 확인.
 *
 *   npm run check:rules
 *
 * DB · LLM · 화면 없이 엔진만 태운다. 규칙을 고칠 때 결론이 어떻게 달라지는지
 * 눈으로 보라고 만든 것이라, 통과/실패를 단정하지 않고 판정 결과를 그대로 찍는다.
 * 다만 하나는 경고한다 — 게이트가 존재하지 않는 근거를 가리키면 안 된다.
 */
import { evaluate } from '../lib/no-meeting/engine';
import type { Evidence, MeetingRequest } from '../lib/no-meeting/types';

const now = Date.now();
const iso = (h: number) => new Date(now + h * 3_600_000).toISOString();

const req = (over: Partial<MeetingRequest>): MeetingRequest => ({
  id: 'rq-t', source: 'REQUEST', title: '테스트', purposeText: '',
  scheduledAt: iso(24), requestedBy: '박현우',
  attendeeCandidates: ['박현우', '김지은'], plannedMinutes: 30,
  createdAt: iso(-1), agenda: [], typeCandidates: [], typeRationale: '',
  explicitTypeMarker: null, patternKey: null, ...over,
});

const ev = (id: string, kind: Evidence['kind'], facts: Evidence['facts'], hoursAgo = 1): Evidence => ({
  id, source: 'teamsync', sourceRef: `x:${id}`, kind,
  summary: `${id} 결제 릴리즈 상태`, observedAt: iso(-hoursAgo), facts,
});

const run = (label: string, request: MeetingRequest, evidence: Evidence[]) => {
  const r = evaluate({ request, evidence, droppedSources: [], activePolicies: [], now, id: 'ev-t' });
  const gates = r.gateChecks.map((g) => `${g.label}=${g.status}`).join(', ');
  console.log(`\n[${label}] type=${r.meetingType} outcome=${r.outcome ?? 'null'} artifact=${r.artifact?.type ?? 'none'}`);
  console.log(`  ${gates || '(게이트 없음)'}`);
  // 근거가 실제로 붙었는지 — M2 가 고쳐졌는지 확인
  const orphan = r.gateChecks.filter((g) => g.evidenceIds.some((i) => !r.evidence.some((e) => e.id === i)));
  if (orphan.length) console.log(`  ⚠ 근거 참조가 끊긴 게이트: ${orphan.map((g) => g.key).join(',')}`);
  return r;
};

// T1 · 전부 충족 → DELETE
run('T1 all-pass', req({
  typeCandidates: [{ type: 'STATUS', score: 0.9 }, { type: 'PLANNING', score: 0.2 }],
  agenda: [{ id: 'a1', title: '결제 릴리즈 상태 확인', kind: 'INFO', evidenceIds: ['e1'] }],
}), [
  ev('e1', 'TASK_STATUS', { taskDone: 24, taskTotal: 24 }),
  ev('e2', 'DELIVERY', { deliveredTo: ['박현우', '김지은'] }),
]);

// T1 · 아무도 못 받음 → 전달 조건 FAIL
run('T1 undelivered', req({
  typeCandidates: [{ type: 'STATUS', score: 0.9 }, { type: 'PLANNING', score: 0.2 }],
  agenda: [{ id: 'a1', title: '결제 릴리즈 상태 확인', kind: 'INFO', evidenceIds: ['e1'] }],
}), [
  ev('e1', 'TASK_STATUS', { taskDone: 24, taskTotal: 24 }),
  ev('e2', 'DELIVERY', { deliveredTo: [] }),
]);

// T1 · 모호한 상태 (Task 단위 아님)
run('T1 ambiguous', req({
  typeCandidates: [{ type: 'STATUS', score: 0.9 }, { type: 'PLANNING', score: 0.2 }],
  agenda: [{ id: 'a1', title: '결제 릴리즈 상태 확인', kind: 'INFO', evidenceIds: ['e1'] }],
}), [
  ev('e1', 'TASK_STATUS', { owner: '박현우' }),
  ev('e2', 'DELIVERY', { deliveredTo: ['박현우', '김지은'] }),
]);

// T2 · 조건 충족 + 가치판단 1건 → DECIDE
run('T2 decide', req({
  typeCandidates: [{ type: 'DECISION', score: 0.94 }, { type: 'STATUS', score: 0.3 }],
  agenda: [{ id: 'a1', title: '결제 P1 결함 안고 출시할지', kind: 'DECISION', evidenceIds: ['e1'] }],
}), [
  ev('e1', 'TASK_STATUS', { checklistDone: 12, checklistTotal: 12, openP1: 1, owner: '김서영' }),
]);

// T2 · 이미 답이 나온 질문 → 가치판단 0건
run('T2 already answered', req({
  typeCandidates: [{ type: 'DECISION', score: 0.94 }, { type: 'STATUS', score: 0.3 }],
  agenda: [{ id: 'a1', title: '결제 P1 결함 안고 출시할지', kind: 'DECISION', evidenceIds: ['e1'] }],
}), [
  ev('e1', 'TASK_STATUS', { checklistDone: 12, checklistTotal: 12, openP1: 1, owner: '김서영' }),
  { id: 'e9', source: 'teamsync', sourceRef: 'decisions:1', kind: 'ANSWER',
    summary: '“결제 P1 결함 안고 출시할지” — 이미 “보완 후 진행” 으로 답했습니다.',
    observedAt: iso(-2), facts: { answeredChoice: '보완 후 진행' } },
]);

// T3 · 가설 경합 → SHRINK
run('T3 hypothesis tie', req({
  typeCandidates: [{ type: 'PROBLEM_SOLVING', score: 0.89 }, { type: 'CONFLICT_CRISIS', score: 0.4 }],
  agenda: [{ id: 'a1', title: '결제 실패율 급증 원인', kind: 'QUESTION', evidenceIds: ['e1'] }],
}), [
  ev('e1', 'ALERT', { alertCount: 12, hypothesisScores: [0.41, 0.36], owner: '김서영' }),
]);

// T4 · 조율 → SHRINK
run('T4 planning', req({
  typeCandidates: [{ type: 'PLANNING', score: 0.8 }, { type: 'STATUS', score: 0.3 }],
  agenda: [{ id: 'a1', title: '스프린트 일정 조율', kind: 'INFO', evidenceIds: [] }],
}), []);

// T7 · 위기 → MEET
run('T7 crisis', req({ explicitTypeMarker: 'CONFLICT_CRISIS' }), []);

// T8 · 점수 경합 → 결론 없음
run('T8 tie', req({
  typeCandidates: [{ type: 'STATUS', score: 0.44 }, { type: 'PLANNING', score: 0.41 }],
}), []);
