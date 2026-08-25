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
  explicitTypeMarker: null, patternKey: null, scopeKeys: [], ...over,
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

// T1 · 세션 요약이 섞여 있어도 이슈트래커가 상태를 세면 회의는 사라진다.
//      p1.2 이전에는 세션 요약이 TASK_STATUS 라 여기서 해석 모호성이 FAIL 이었고,
//      훅과 이슈트래커를 둘 다 붙인 팀은 DELETE 에 영영 도달하지 못했다.
run('T1 세션 요약 + 이슈트래커', req({
  typeCandidates: [{ type: 'STATUS', score: 0.9 }, { type: 'PLANNING', score: 0.2 }],
  agenda: [{ id: 'a1', title: '결제 릴리즈 상태 확인', kind: 'INFO', evidenceIds: ['e1'] }],
}), [
  // 이슈트래커 — 셀 수 있는 상태
  { id: 'e1', source: 'jira', sourceRef: 'jira:PAY-1', kind: 'TASK_STATUS',
    summary: 'PAY-1 · 서브태스크 3건 중 완료 3건', observedAt: iso(-0.5),
    facts: { taskDone: 3, taskTotal: 3, owner: '박현우' } },
  // 훅 — 셀 수 없는 작업 로그. 상태 근거가 아니므로 모호성에 세지 않는다.
  { id: 'e2', source: 'teamsync', sourceRef: 'context:9', kind: 'WORK_LOG',
    summary: '결제 화면 정리 완료', observedAt: iso(-1), facts: { owner: '박현우' } },
  ev('e3', 'DELIVERY', { deliveredTo: ['박현우', '김지은'] }),
]);

// T1 · 훅만 붙은 팀 — 셀 수 있는 상태가 아예 없다.
//      "있는데 셀 수 없다"(FAIL)가 아니라 "없다"(UNKNOWN)가 맞는 말이다.
run('T1 훅만 (이슈트래커 없음)', req({
  typeCandidates: [{ type: 'STATUS', score: 0.9 }, { type: 'PLANNING', score: 0.2 }],
  agenda: [{ id: 'a1', title: '결제 릴리즈 상태 확인', kind: 'INFO', evidenceIds: [] }],
}), [
  { id: 'e1', source: 'teamsync', sourceRef: 'context:9', kind: 'WORK_LOG',
    summary: '결제 화면 정리 완료', observedAt: iso(-1), facts: { owner: '박현우' } },
  ev('e2', 'DELIVERY', { deliveredTo: ['박현우', '김지은'] }),
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

// T3 · 배제 못한 후보가 남았다 → SHRINK
run('T3 원인 후보 경합', req({
  typeCandidates: [{ type: 'PROBLEM_SOLVING', score: 0.89 }, { type: 'CONFLICT_CRISIS', score: 0.4 }],
  agenda: [{ id: 'a1', title: '결제 실패율 급증 원인', kind: 'QUESTION', evidenceIds: ['e1'] }],
}), [
  ev('e1', 'ALERT', {
    alertCount: 12, owner: '김서영',
    leadingHypothesis: '게이트웨이 타임아웃', openHypotheses: ['커넥션 풀 고갈'],
  }),
]);

// T3 · 원인이 하나로 좁혀졌다 → 더는 모일 이유가 없다.
// 예전에는 이 경로가 존재하지 않았다 — 공급자가 없어 항상 UNKNOWN 이었다.
run('T3 원인 단일', req({
  typeCandidates: [{ type: 'PROBLEM_SOLVING', score: 0.89 }, { type: 'CONFLICT_CRISIS', score: 0.4 }],
  agenda: [{ id: 'a1', title: '결제 실패율 급증 원인', kind: 'QUESTION', evidenceIds: ['e1'] }],
}), [
  ev('e1', 'ALERT', {
    alertCount: 12, owner: '김서영',
    leadingHypothesis: '게이트웨이 타임아웃', openHypotheses: [],
  }),
]);

// T3 · 아무도 원인을 안 적었다 → AI 가 고르지 않는다
run('T3 원인 미기재', req({
  typeCandidates: [{ type: 'PROBLEM_SOLVING', score: 0.89 }, { type: 'CONFLICT_CRISIS', score: 0.4 }],
  agenda: [{ id: 'a1', title: '결제 실패율 급증 원인', kind: 'QUESTION', evidenceIds: ['e1'] }],
}), [
  ev('e1', 'ALERT', { alertCount: 12, owner: '김서영' }),
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

// ══════════════════════════════════════════════════════════════════
// 바인딩 — 커넥터를 붙여도 여기서 안 이어지면 아무 일도 안 일어난다.
// 판정 이전 단계라 별도로 확인한다.
// ══════════════════════════════════════════════════════════════════
import { bindEvidence, extractNameKeys, extractRefKeys } from '../lib/no-meeting/scope';

const bindCase = (
  label: string,
  request: MeetingRequest,
  pool: Evidence[],
  expect: { ids: string[]; via?: string },
) => {
  const got = bindEvidence(request, pool, now);
  const ids = got.map((e) => e.id).sort();
  const want = [...expect.ids].sort();
  const ok = ids.join(',') === want.join(',')
    && (!expect.via || got.every((e) => e.boundVia === expect.via));
  console.log(`\n[bind ${label}] ${ok ? 'OK' : '✗ 불일치'}`);
  console.log(`  기대 ${want.join(',') || '(없음)'} / 실제 ${ids.join(',') || '(없음)'}`);
  for (const e of got) console.log(`    ${e.id} ← ${e.boundVia} · ${e.boundReason}`);
  if (!ok) process.exitCode = 1;
};

const poolEv = (
  id: string, owner: string | undefined, scopeKeys: string[], summary: string, hoursAgo = 1,
): Evidence => ({
  id, source: 'jira', sourceRef: `jira:${id}`, kind: 'TASK_STATUS',
  summary, observedAt: iso(-hoursAgo), facts: owner ? { owner } : undefined, scopeKeys,
});

const pool: Evidence[] = [
  poolEv('e-pay', '김지은', ['pay-118'], 'PAY-118 결제 API 리팩터링 · Task 24건 중 24건'),
  poolEv('e-srch', '지우', ['srch-77'], 'SRCH-77 검색 랭킹 개편 · Task 10건 중 7건'),
  poolEv('e-old', '김지은', ['rel-52'], 'REL-52 QA 체크리스트', 24 * 30),
  poolEv('e-nobody', undefined, ['ops-9'], 'OPS-9 인프라 정리'),
];

// 1. 제목에 이슈키가 적혀 있으면 그것으로 붙는다
bindCase('SCOPE · 이슈키가 적힌 신청서', req({
  title: '[PAY-118] 결제 리팩터링 어디까지 됐나요',
  scopeKeys: ['pay-118'],
  attendeeCandidates: [],
  requestedBy: '박현우',
}), pool, { ids: ['e-pay'], via: 'SCOPE' });

// 2. 아무것도 안 적어도 부른 사람이 최근에 건드린 것으로 붙는다 — 실사용 기본 경로
bindCase('PEOPLE · 키 없는 신청서', req({
  title: '이번 주 싱크',
  scopeKeys: [],
  attendeeCandidates: ['김지은', '지우'],
  requestedBy: '박현우',
}), pool, { ids: ['e-pay', 'e-srch'], via: 'PEOPLE' });

// 3. 시간 창 밖의 사실은 같은 사람 것이어도 안 붙는다
bindCase('PEOPLE · 30일 전 것은 제외', req({
  title: '릴리즈 이야기',
  scopeKeys: [],
  attendeeCandidates: ['김지은'],
  requestedBy: '박현우',
}), pool, { ids: ['e-pay'], via: 'PEOPLE' });

// 4. 조사가 붙어도 같은 말로 본다 (예전 토크나이저는 여기서 0건이었다)
bindCase('WORDS · 조사 보정', req({
  title: '검색 랭킹을 개편한 건 언제 끝나나요',
  scopeKeys: [],
  attendeeCandidates: [],
  requestedBy: '박현우',
}), pool, { ids: ['e-srch'], via: 'WORDS' });

// 5. 문장 속 파일 경로를 대상으로 착각하지 않는다.
//    실데이터(세션 요약)에 태워 보니 예전 규칙은 app/login/page.tsx 를 브랜치로 집었다.
{
  const prose = '로그인 페이지가 app/login/page.tsx 에 추가되었고 lib/types.ts 를 고쳤습니다. PAY-118 관련입니다.';
  const fromProse = extractRefKeys(prose);
  const fromBranch = extractNameKeys('feature/commerce-api');
  console.log(`\n[scope 추출]`);
  console.log(`  문장 → ${JSON.stringify(fromProse)}`);
  console.log(`  브랜치 → ${JSON.stringify(fromBranch)}`);
  const cases: [string, boolean][] = [
    ['문장에서 이슈키는 뽑는다', fromProse.includes('pay-118')],
    ['문장의 파일 경로는 대상이 아니다',
      !fromProse.some((k: string) => k.includes('page.tsx') || k.includes('types.ts'))],
    ['브랜치에서는 이름을 뽑는다',
      fromBranch.includes('feature/commerce-api') && fromBranch.includes('commerce-api')],
  ];
  for (const [label, ok] of cases) {
    console.log(`  ${ok ? 'OK  ' : '✗   '} ${label}`);
    if (!ok) process.exitCode = 1;
  }
}

// 6. 붙일 근거가 없으면 없는 대로 둔다 — 관련 없는 것을 끌어오지 않는다
bindCase('없음 · 지어내지 않는다', req({
  title: '점심 메뉴 정하기',
  scopeKeys: [],
  attendeeCandidates: ['한동훈'],
  requestedBy: '한동훈',
}), pool, { ids: [] });

// ══════════════════════════════════════════════════════════════════
// 최신성 — 오래된 근거 한 줄이 판정을 영구히 막던 자리.
// 소스별 최신값을 보고, 그중 가장 뒤처진 소스를 쓴다.
// ══════════════════════════════════════════════════════════════════

// 세션 요약은 방금 들어왔는데 30일 된 브랜치 행이 같이 붙어 있다.
// 예전 규칙(전체에서 가장 오래된 것)이면 STATUS 기준 3시간을 영영 못 넘겼다.
run('T1 오래된 브랜치 행이 섞여도 최신', req({
  typeCandidates: [{ type: 'STATUS', score: 0.9 }, { type: 'PLANNING', score: 0.2 }],
  agenda: [{ id: 'a1', title: '결제 릴리즈 상태 확인', kind: 'INFO', evidenceIds: ['e1'] }],
}), [
  ev('e1', 'TASK_STATUS', { taskDone: 24, taskTotal: 24 }, 0.5),
  ev('e2', 'DELIVERY', { deliveredTo: ['박현우', '김지은'] }, 0.5),
  ev('e3', 'BRANCH_STATE', { merged: true, owner: '박현우' }, 24 * 30),
]);

// 반대로 소스 하나가 통째로 멈춰 있으면 낡은 것이 맞다 — 원칙은 소스 사이에서 지킨다.
run('T1 멈춘 소스가 있으면 FAIL', req({
  typeCandidates: [{ type: 'STATUS', score: 0.9 }, { type: 'PLANNING', score: 0.2 }],
  agenda: [{ id: 'a1', title: '결제 릴리즈 상태 확인', kind: 'INFO', evidenceIds: ['e1'] }],
}), [
  ev('e1', 'TASK_STATUS', { taskDone: 24, taskTotal: 24 }, 0.5),
  ev('e2', 'DELIVERY', { deliveredTo: ['박현우', '김지은'] }, 0.5),
  { id: 'e4', source: 'jira', sourceRef: 'jira:PAY-1', kind: 'TASK_STATUS',
    summary: '멈춘 이슈트래커', observedAt: iso(-50), facts: { taskDone: 3, taskTotal: 3 } },
]);

// ══════════════════════════════════════════════════════════════════
// 이슈트래커 매핑 — 셈이 틀리면 게이트가 조용히 거짓 PASS 를 낸다.
// 실제 Jira 를 붙여 봐야 아는 종류의 버그가 아니므로 여기서 확인한다.
// ══════════════════════════════════════════════════════════════════
import { issuesToEvidence } from '../lib/no-meeting/connect/jira-map';
import type { JiraConfig } from '../lib/no-meeting/connect/store';

const jiraCfg: JiraConfig = {
  host: 'x.atlassian.net', email: 'bot@c.com', apiToken: 't',
  projectKeys: ['PAY'],
  identityMap: { 'Seoyoung Kim': '김서영' },   // Jira 이름 → 이 앱 이름
};

const jiraEv = issuesToEvidence([
  // 서브태스크가 있는 이슈 — 선행 조건이 여기서 나온다
  {
    key: 'PAY-118',
    fields: {
      summary: '결제 API 리팩터링', updated: iso(-1),
      assignee: { displayName: 'Seoyoung Kim' },
      priority: { name: 'Medium' }, status: { statusCategory: { key: 'indeterminate' } },
      labels: ['payment'], components: [{ name: 'commerce-api' }],
      subtasks: [
        { key: 'PAY-119', fields: { status: { statusCategory: { key: 'done' } } } },
        { key: 'PAY-120', fields: { status: { statusCategory: { key: 'done' } } } },
        { key: 'PAY-121', fields: { status: { statusCategory: { key: 'todo' } } } },
      ],
    },
  },
  // 서브태스크 없는 완료 이슈 — 그 자체가 최소 단위라 1/1
  {
    key: 'PAY-200',
    fields: {
      summary: '영수증 문구 수정', updated: iso(-2),
      assignee: { displayName: 'Jiwoo Han' },     // 매핑에 없는 사람
      status: { statusCategory: { key: 'done' } },
    },
  },
  // 미완 P1
  {
    key: 'PAY-201',
    fields: {
      summary: '결제 실패 시 이중 청구', updated: iso(-3),
      assignee: { displayName: 'Seoyoung Kim' },
      priority: { name: 'Highest' }, status: { statusCategory: { key: 'indeterminate' } },
    },
  },
], jiraCfg);

console.log('\n[jira 매핑]');
for (const e of jiraEv) {
  const f = e.facts ?? {};
  console.log(`  ${e.sourceRef}`);
  console.log(`    task=${f.taskDone}/${f.taskTotal}`
    + `  checklist=${f.checklistTotal === undefined ? '(없음)' : `${f.checklistDone}/${f.checklistTotal}`}`
    + `  openP1=${f.openP1}  owner=${f.owner}`);
  console.log(`    scope=${(e.scopeKeys ?? []).join(',')}`);
}

const expectJira: [string, boolean][] = [
  ['PAY-118 서브태스크로 센다 (2/3)',
    jiraEv[0].facts?.taskDone === 2 && jiraEv[0].facts?.taskTotal === 3],
  ['PAY-118 선행 조건이 채워진다 (2/3)',
    jiraEv[0].facts?.checklistDone === 2 && jiraEv[0].facts?.checklistTotal === 3],
  ['PAY-118 스코프에 이슈키·프로젝트·컴포넌트가 다 들어간다',
    ['pay-118', 'pay', 'commerce-api', 'payment'].every((k) => jiraEv[0].scopeKeys?.includes(k))],
  ['PAY-200 서브태스크 없으면 선행 조건 칸은 비운다 (거짓 PASS 방지)',
    jiraEv[1].facts?.checklistTotal === undefined],
  ['PAY-200 완료 이슈는 1/1',
    jiraEv[1].facts?.taskDone === 1 && jiraEv[1].facts?.taskTotal === 1],
  ['매핑에 없는 사람은 원래 이름 그대로 (지어내지 않는다)',
    jiraEv[1].facts?.owner === 'Jiwoo Han'],
  ['매핑된 사람은 이 앱 이름으로', jiraEv[0].facts?.owner === '김서영'],
  ['미완 Highest 는 P1 로 센다', jiraEv[2].facts?.openP1 === 1],
  ['P1 아닌 이슈는 0 (모름이 아니라 0)', jiraEv[0].facts?.openP1 === 0],
];
for (const [label, ok] of expectJira) {
  console.log(`  ${ok ? 'OK  ' : '✗   '} ${label}`);
  if (!ok) process.exitCode = 1;
}

// ══════════════════════════════════════════════════════════════════
// 장애 알림 매핑. 이 커넥터가 여는 조건은 `symptom_measured` 하나뿐이고,
// 그 이상을 주장하지 않는지 확인한다 — 원인 후보는 여기서 오지 않는다.
// ══════════════════════════════════════════════════════════════════
import { issuesToEvidence as sentryToEvidence } from '../lib/no-meeting/connect/sentry-map';

const sentryEv = sentryToEvidence([
  {
    id: '991', shortId: 'COMMERCE-API-7C', title: 'TimeoutError: gateway',
    culprit: 'payment/gateway', level: 'error', count: '312', userCount: 48,
    lastSeen: iso(-0.5), project: { slug: 'commerce-api' },
    assignedTo: { name: 'Seoyoung Kim' },
  },
  {
    id: '992', shortId: 'COMMERCE-API-8D', title: 'NullPointer',
    culprit: 'search/rank', count: 7, lastSeen: iso(-3),
    project: { slug: 'commerce-api' }, assignedTo: null,
  },
], { 'Seoyoung Kim': '김서영' });

console.log('\n[sentry 매핑]');
for (const e of sentryEv) {
  console.log(`  ${e.sourceRef}  alertCount=${e.facts?.alertCount}  owner=${e.facts?.owner ?? '(없음)'}`);
  console.log(`    scope=${(e.scopeKeys ?? []).join(',')}`);
}

const expectSentry: [string, boolean][] = [
  ['문자열 count 를 숫자로 센다', sentryEv[0].facts?.alertCount === 312],
  ['숫자 count 도 그대로', sentryEv[1].facts?.alertCount === 7],
  ['담당자가 매핑된다', sentryEv[0].facts?.owner === '김서영'],
  ['담당자가 없으면 비운다 (0 이 아니라 없음)', sentryEv[1].facts?.owner === undefined],
  ['프로젝트 슬러그가 스코프에 들어간다', sentryEv[0].scopeKeys?.includes('commerce-api') === true],
  ['원인 후보를 만들지 않는다',
    sentryEv.every((e) => e.facts?.leadingHypothesis === undefined)],
];
for (const [label, ok] of expectSentry) {
  console.log(`  ${ok ? 'OK  ' : '✗   '} ${label}`);
  if (!ok) process.exitCode = 1;
}
