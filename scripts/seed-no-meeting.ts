/**
 * NO MEETING 데모 데이터.
 *
 *   npm run seed:no-meeting            # hankki 에 넣기
 *   npm run seed:no-meeting -- --clean # 넣은 것만 지우기
 *
 * 손으로 쓴 JSON 을 넣지 않는다. 실제 엔진(evaluate)을 태워서 만든다 —
 * 게이트·근거·산출물이 화면이 기대하는 모양과 어긋나면 데모가 거짓말을 한다.
 *
 * context · injections · branches 같은 실데이터는 건드리지 않는다.
 * 넣는 행에는 전부 `seed-` 접두사가 붙어서 --clean 으로 정확히 되돌릴 수 있다.
 */
import { serverClient } from '../lib/supabase';
import { evaluate } from '../lib/no-meeting/engine';
import { persistEvaluation } from '../lib/no-meeting/persist';
import { responseStats as countResponses } from '../lib/no-meeting/stats';
import { POLICY_THRESHOLD, RULE_VERSION } from '../lib/no-meeting/settings';
import type { Evidence, MeetingRequest, Policy } from '../lib/no-meeting/types';

const PID = process.argv.find((a) => !a.startsWith('--') && a !== process.argv[0] && a !== process.argv[1]) ?? 'hankki';
const CLEAN = process.argv.includes('--clean');

const H = 3_600_000;
const at = (hours: number) => new Date(Date.now() + hours * H).toISOString();

const db = serverClient();

async function clean() {
  // 시드 요청에 달린 판정은 화면에서 "판정" 을 눌러 생긴 것도 있어서 id 가 seed- 가
  // 아니다. 그것까지 훑지 않으면 요청이 지워질 때 cascade 로 판정만 사라지고
  // 원장 행은 남아 존재하지 않는 판정을 가리킨다.
  const { data: evs } = await db.from('evaluations')
    .select('id').eq('project_id', PID).like('request_id', 'seed-%');
  const evIds = (evs ?? []).map((e) => e.id as string);

  if (evIds.length > 0) {
    await db.from('decisions').delete().eq('project_id', PID).in('evaluation_id', evIds);
    await db.from('nm_ledger').delete().eq('project_id', PID).in('evaluation_id', evIds);
  }
  await db.from('decisions').delete().eq('project_id', PID).like('evaluation_id', 'seed-%');
  await db.from('nm_ledger').delete().eq('project_id', PID).like('evaluation_id', 'seed-%');
  await db.from('nm_ledger').delete().eq('project_id', PID).like('id', 'seed-%');
  await db.from('evaluations').delete().eq('project_id', PID).like('id', 'seed-%');
  await db.from('meeting_requests').delete().eq('project_id', PID).like('id', 'seed-%');
  await db.from('nm_policies').delete().eq('project_id', PID).like('id', 'seed-%');
  console.log(`[${PID}] seed- 행을 전부 지웠습니다.`);
}

// ── 요청 · 근거 ───────────────────────────────────────────────────

const req = (o: Partial<MeetingRequest> & { id: string; title: string }): MeetingRequest => ({
  source: 'REQUEST', purposeText: '', scheduledAt: at(24), requestedBy: '이중희',
  attendeeCandidates: [], plannedMinutes: 30, createdAt: at(-4),
  agenda: [], typeCandidates: [], typeRationale: '', explicitTypeMarker: null, patternKey: null,
  scopeKeys: [],
  ...o,
});

const ev = (
  id: string, source: Evidence['source'], sourceRef: string,
  kind: Evidence['kind'], summary: string, hoursAgo: number, facts?: Evidence['facts'],
): Evidence => ({ id, source, sourceRef, kind, summary, observedAt: at(-hoursAgo), facts });

/** 판정까지 끝난 것들 — "최근 판정" 과 원장을 채운다. */
const JUDGED: { request: MeetingRequest; evidence: Evidence[] }[] = [
  {
    // T1 · 조건 전부 충족 → 회의가 사라진다
    request: req({
      id: 'seed-rq-1', title: '주간 개발 싱크',
      purposeText: '· 배차 로직 리팩터링 진행 상황\n· 3.2 릴리즈 Task 소진 현황\n\n→ 이번 주 상황 공유',
      scheduledAt: at(-6), createdAt: at(-30), plannedMinutes: 30,
      requestedBy: '이중희', attendeeCandidates: ['이중희', '창현', '허주영'],
      agenda: [
        { id: 'a1', title: '배차 로직 리팩터링 진행 상황', kind: 'INFO', evidenceIds: ['seed-e1-1'] },
        { id: 'a2', title: '3.2 릴리즈 Task 소진 현황', kind: 'INFO', evidenceIds: ['seed-e1-2'] },
      ],
      typeCandidates: [{ type: 'STATUS', score: 0.92 }, { type: 'PLANNING', score: 0.28 }],
      typeRationale: '안건이 전부 상태 전달이고 질의·결정 안건이 0건입니다.',
    }),
    evidence: [
      ev('seed-e1-1', 'jira', 'jira:HANK-204', 'TASK_STATUS', '배차 로직 리팩터링 — Task 9건 중 완료 9건', 2, { taskDone: 9, taskTotal: 9, owner: '창현' }),
      ev('seed-e1-2', 'jira', 'jira:HANK-210', 'TASK_STATUS', '3.2 릴리즈 — Task 18건 중 완료 18건 · 미확인 0건', 2, { taskDone: 18, taskTotal: 18 }),
      ev('seed-e1-3', 'teamsync', 'injections:context=seed-1', 'DELIVERY', '이 요약을 이중희 · 창현 · 허주영 의 에이전트가 이미 주입받았습니다.', 3, { deliveredTo: ['이중희', '창현', '허주영'] }),
      ev('seed-e1-4', 'alerts', 'alerts:hankki-api', 'ALERT', '최근 24시간 5xx 알림 0건', 2, { alertCount: 0 }),
    ],
  },
  {
    // T1 · 상태가 Task 단위로 안 세짐 → 모호성 FAIL
    request: req({
      id: 'seed-rq-2', title: '주문 취소 플로우 진행 공유',
      purposeText: '· 주문 취소 플로우 어디까지 됐는지\n\n→ 남은 일정 파악',
      scheduledAt: at(-2), createdAt: at(-20), plannedMinutes: 30,
      requestedBy: '허주영', attendeeCandidates: ['허주영', '김민성', '이중희'],
      agenda: [{ id: 'a1', title: '주문 취소 플로우 진행 상황', kind: 'INFO', evidenceIds: ['seed-e2-1'] }],
      typeCandidates: [{ type: 'STATUS', score: 0.87 }, { type: 'PLANNING', score: 0.31 }],
      typeRationale: '상태 전달이 목적이며 결정 안건이 없습니다.',
    }),
    evidence: [
      ev('seed-e2-1', 'teamsync', 'context:seed-2', 'WORK_LOG', '주문 취소 플로우 — "거의 다 됐습니다" 로만 보고됨', 4, { owner: '김민성' }),
      ev('seed-e2-2', 'teamsync', 'injections:context=seed-2', 'DELIVERY', '이 요약을 허주영 · 김민성 · 이중희 의 에이전트가 이미 주입받았습니다.', 4, { deliveredTo: ['허주영', '김민성', '이중희'] }),
    ],
  },
  {
    // T2 · 조건은 다 됐고 가치판단만 남았다 → 결정 카드
    request: req({
      id: 'seed-rq-3', title: '3.2 릴리즈 Go / No-Go',
      purposeText: '· QA 체크리스트 소진 확인\n· 결제 도메인 P1 결함을 안고 출시할 것인가\n\n→ 출시 여부 결론',
      scheduledAt: at(8), createdAt: at(-10), plannedMinutes: 45,
      requestedBy: '이중희', attendeeCandidates: ['이중희', '창현', '허주영', '김민성'],
      agenda: [
        { id: 'a1', title: 'QA 체크리스트 소진 확인', kind: 'INFO', evidenceIds: ['seed-e3-1'] },
        { id: 'a2', title: '결제 도메인 P1 결함을 안고 출시할 것인가', kind: 'DECISION', evidenceIds: ['seed-e3-2'] },
      ],
      typeCandidates: [{ type: 'DECISION', score: 0.95 }, { type: 'STATUS', score: 0.29 }],
      typeRationale: '출시 여부라는 단일 결정 안건이 있고 나머지 안건은 그 근거입니다.',
      patternKey: 'minor-release-p1-defect',
    }),
    evidence: [
      ev('seed-e3-1', 'jira', 'jira:HANK-QA-32', 'TASK_STATUS', 'QA 체크리스트 14건 중 14건 완료', 1, { checklistDone: 14, checklistTotal: 14 }),
      ev('seed-e3-2', 'jira', 'jira:HANK-311', 'TASK_STATUS', '결제 도메인 P1 결함 1건 잔존 · 우회 경로 있음', 1, { openP1: 1, owner: '창현' }),
      ev('seed-e3-3', 'alerts', 'alerts:staging', 'ALERT', '스테이징 5xx 알림 0건 · 48시간', 1, { alertCount: 0 }),
    ],
  },
  {
    // T3 · 원인 가설이 경합한다 → 축소 개최
    request: req({
      id: 'seed-rq-4', title: '결제 실패율 급증 원인 조사',
      purposeText: '· 결제 API 5xx 가 급증한 원인\n\n→ 원인 특정',
      scheduledAt: at(3), createdAt: at(-2), plannedMinutes: 30,
      requestedBy: '김민성', attendeeCandidates: ['김민성', '창현', '이중희', '웅이아버지'],
      agenda: [{ id: 'a1', title: '결제 API 5xx 급증 원인 규명', kind: 'QUESTION', evidenceIds: ['seed-e4-1'] }],
      typeCandidates: [{ type: 'PROBLEM_SOLVING', score: 0.9 }, { type: 'CONFLICT_CRISIS', score: 0.44 }],
      typeRationale: '증상이 특정되어 있고 원인 규명이 목적입니다.',
    }),
    evidence: [
      ev('seed-e4-1', 'alerts', 'alerts:pay-5xx', 'ALERT', '결제 API 5xx 급증 — 실패율 0.3% → 2.8% · 누적 9건', 1, { alertCount: 9, owner: '김민성' }),
      ev('seed-e4-2', 'REQUEST', 'request:seed-rq-4', 'AGENDA', '신청자가 적은 원인 후보 — 유력: 게이트웨이 타임아웃 / 배제 못함: 커넥션 풀 고갈 · 어제 배포', 0.5, { leadingHypothesis: '게이트웨이 타임아웃', openHypotheses: ['커넥션 풀 고갈', '어제 배포'] }),
    ],
  },
  {
    // T6 · 제목조차 읽지 않는다 → 회의 유지
    request: req({
      id: 'seed-rq-5', title: '1:1',
      scheduledAt: at(28), createdAt: at(-16), plannedMinutes: 30,
      requestedBy: '이중희', attendeeCandidates: ['이중희', '웅이아버지'],
      explicitTypeMarker: 'FEEDBACK_1ON1',
      typeCandidates: [{ type: 'FEEDBACK_1ON1', score: 1 }],
      typeRationale: '신청자가 1:1 로 표시했습니다. 제목과 안건은 읽지 않았습니다.',
    }),
    evidence: [],
  },
];

/** 아직 판정하지 않은 것들 — 판정 대기 큐를 채운다. */
const PENDING: MeetingRequest[] = [
  req({
    id: 'seed-rq-q1', title: '라이더 배차 알고리즘 점검',
    purposeText: '· 피크타임 배차 지연이 얼마나 줄었는지\n· 신규 가중치 반영 현황\n\n→ 현황 공유 문서',
    scheduledAt: at(20), createdAt: at(-1), plannedMinutes: 30,
    requestedBy: '창현', attendeeCandidates: ['창현', '이중희', '김민성'],
    agenda: [
      { id: 'a1', title: '피크타임 배차 지연 개선 폭', kind: 'INFO', evidenceIds: [] },
      { id: 'a2', title: '신규 가중치 반영 현황', kind: 'INFO', evidenceIds: [] },
    ],
    typeCandidates: [{ type: 'STATUS', score: 0.89 }, { type: 'PLANNING', score: 0.3 }],
    typeRationale: '두 안건 모두 상태 확인이고 결정 안건이 없습니다.',
  }),
  req({
    id: 'seed-rq-q2', title: '쿠폰 중복 사용 정책',
    purposeText: '· 신규가입 쿠폰과 재주문 쿠폰을 겹쳐 쓸 수 있게 할지\n\n→ 정책 결론',
    scheduledAt: at(30), createdAt: at(-1), plannedMinutes: 60,
    requestedBy: '허주영', attendeeCandidates: ['허주영', '이중희', '웅이아버지'],
    agenda: [{ id: 'a1', title: '신규가입 쿠폰과 재주문 쿠폰 중복 허용 여부', kind: 'DECISION', evidenceIds: [] }],
    typeCandidates: [{ type: 'DECISION', score: 0.88 }, { type: 'PLANNING', score: 0.35 }],
    typeRationale: '허용 여부라는 단일 결정 안건이 있습니다.',
    patternKey: 'coupon-stacking',
  }),
];

async function seed() {
  await clean();

  // 판정은 그 시점의 스냅샷이다. 이력과 정책을 **먼저** 넣어야 결정 카드에
  // "보통 몇 시간 안에 답한다" 와 정책 판정이 함께 박힌다. 나중에 넣으면 채워지지 않는다.

  // 1) 같은 판단이 세 번 반복된 이력.
  //    원장에서 세면 정책 후보가 되고, 올라간 시각과 답한 시각의 차이가
  //    결정 카드의 응답 시간이 된다. 그래서 EVALUATED 를 짝지어 넣는다.
  //    이 행들은 원장에만 있다 — 과거 판정의 payload 까지 지어내지는 않는다.
  const hist = [
    { key: 'h1', title: '2.9 릴리즈 · 인증 P1 결함 잔존', days: 52, tookHours: 5 },
    { key: 'h2', title: '3.0 릴리즈 · 결제 P1 결함 잔존', days: 31, tookHours: 3 },
    { key: 'h3', title: '3.1 릴리즈 · 주문 P1 결함 잔존', days: 12, tookHours: 4 },
  ];
  await db.from('nm_ledger').insert(hist.flatMap((h) => {
    const evId = `seed-ev-${h.key}`;
    return [
      {
        id: `seed-lg-${h.key}-e`, project_id: PID, event_type: 'EVALUATED', outcome: 'DECIDE',
        actor: '시스템', title: h.title, summary: 'DECISION · 조건 4/4 충족',
        occurred_at: at(-24 * h.days - h.tookHours), evaluation_id: evId, rule_version: RULE_VERSION,
      },
      {
        id: `seed-lg-${h.key}-d`, project_id: PID, event_type: 'DECIDED', outcome: 'DECIDE',
        actor: '창현', title: h.title, summary: '“보완 후 진행” 을 선택했습니다.',
        occurred_at: at(-24 * h.days), evaluation_id: evId, rule_version: RULE_VERSION,
        pattern_key: 'minor-release-p1-defect', selected_option_key: 'hold',
      },
    ];
  }));
  console.log(`결정 이력 ${hist.length}건 (정책 후보 + 응답 시간)`);

  // 2) 이미 승격된 정책 하나 — active 상태를 화면에서 보이려고
  await db.from('nm_policies').insert({
    id: 'seed-pol-1', project_id: PID,
    pattern_key: 'hotfix-deploy-window', selected_option_key: 'defer',
    title: '핫픽스 배포 시간대',
    rule: '피크타임(11:00–13:00, 17:00–20:00)에는 결제·주문 도메인 핫픽스를 배포하지 않는다.',
    exception: '장애 복구 목적의 롤백은 시간대와 무관하게 즉시 배포한다.',
    activated_by: '이중희', activated_at: at(-24 * 9),
  });
  await db.from('nm_ledger').insert({
    id: 'seed-lg-pol', project_id: PID, event_type: 'POLICY_ACTIVATED', outcome: null,
    actor: '이중희', title: '정책 등록 — 핫픽스 배포 시간대',
    summary: '피크타임에는 결제·주문 도메인 핫픽스를 배포하지 않는다.',
    occurred_at: at(-24 * 9), evaluation_id: null, rule_version: RULE_VERSION,
    pattern_key: 'hotfix-deploy-window', selected_option_key: 'defer',
  });
  console.log('정책 1건(active)');

  // 3) 판정 대기 큐
  await db.from('meeting_requests').insert(PENDING.map((r) => ({
    id: r.id, project_id: PID, source: r.source, title: r.title,
    purpose_text: r.purposeText, scheduled_at: r.scheduledAt, requested_by: r.requestedBy,
    attendee_candidates: r.attendeeCandidates, planned_minutes: r.plannedMinutes,
    agenda: r.agenda, type_candidates: r.typeCandidates, type_rationale: r.typeRationale,
    explicit_type_marker: r.explicitTypeMarker, pattern_key: r.patternKey,
    status: 'PENDING', created_at: r.createdAt,
  })));
  console.log(`판정 대기 ${PENDING.length}건`);

  // 4) 판정 — 엔진을 실제로 태운다. 위에서 넣은 이력·정책을 그대로 물린다.
  //
  // `loadNoMeeting` 을 부르지 않는다. 그 함수는 커넥터 I/O(`connect/*`)를 끌어오고,
  // 그쪽은 `server-only` 로 시작해 Next 번들러 밖에서는 불러올 수 없다.
  // 여기서 필요한 것은 정책과 응답 시간 둘뿐이라 직접 읽는다.
  const [polRes, ledRes] = await Promise.all([
    db.from('nm_policies').select('*').eq('project_id', PID),
    db.from('nm_ledger').select('*').eq('project_id', PID)
      .order('occurred_at', { ascending: false }).limit(100),
  ]);
  const policies: Policy[] = (polRes.data ?? []).map((p) => ({
    id: p.id, patternKey: p.pattern_key, selectedOptionKey: p.selected_option_key,
    status: 'ACTIVE', title: p.title, rule: p.rule, exception: p.exception,
    decisionCount: 0, threshold: POLICY_THRESHOLD, sourceDecisions: [],
    activatedBy: p.activated_by, activatedAt: p.activated_at,
  }));
  const responseStats = countResponses((ledRes.data ?? []).map((r) => ({
    id: r.id, eventType: r.event_type, outcome: r.outcome, actor: r.actor,
    title: r.title, summary: r.summary, occurredAt: r.occurred_at,
    evaluationId: r.evaluation_id, ruleVersion: r.rule_version,
    patternKey: r.pattern_key, selectedOptionKey: r.selected_option_key,
  })));
  let i = 0;
  for (const { request, evidence } of JUDGED) {
    i += 1;
    const e = evaluate({
      request, evidence, droppedSources: [], activePolicies: policies, responseStats,
      now: new Date(request.createdAt).getTime() + H, id: `seed-ev-${i}`,
    });
    await persistEvaluation(PID, request, e);
    const decider = e.artifact?.type === 'DECISION_CARD' ? e.artifact.content.decider : null;
    console.log(`  ${(e.outcome ?? 'T8').padEnd(7)} ${request.title}`
      + (decider ? ` → ${decider.member} (평소 ${decider.typicalResponseHours ?? '?'}시간)` : ''));
  }

  console.log(`\n완료 — /p/${PID}/no-meeting`);
}

(CLEAN ? clean() : seed()).catch((e) => { console.error(e); process.exit(1); });
