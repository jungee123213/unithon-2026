import type {
  ConnectionState, Connector, ConnectorId, DecisionCardContent, Evidence, LedgerEntry,
  MeetingPrescriptionContent, Policy, ResolutionLogContent, Scenario,
} from './types';

/**
 * 데모 입력 — UI 목업 단계의 seed.
 *
 * 실제 서비스에서 이 자리에 들어올 것은 Jira · GitHub · CI · TeamSync 커넥터다.
 * 지금은 "판정이 어떻게 생겼는가" 를 보여주는 게 목적이므로 값만 재현한다.
 * 모든 시각은 `now` 기준으로 생성한다 — 화면의 "3시간 전" 이 어제 자정에 고정되면
 * 최신성 게이트를 시연할 수 없기 때문이다.
 */

export const RULE_VERSION = '2026-08-p0.1';

const H = 3_600_000;
const iso = (base: number, hours: number) => new Date(base + hours * H).toISOString();

// ── 커넥터 ────────────────────────────────────────────────────────
// 이 제품이 스스로 아는 사실은 하나도 없다. 아래 다섯 곳에서 읽어 온다.
// 그래서 "무엇이 연결됐나" 가 "무엇을 판정할 수 있나" 와 같은 말이다.

export const CONNECTORS: Connector[] = [
  {
    id: 'teamsync',
    name: 'TeamSync',
    vendor: '이 저장소',
    role: '개발자가 별도 보고를 쓰지 않아도 되는 이유입니다. Claude Code 훅이 세션 요약을 자동으로 넣습니다.',
    reads: ['세션별 작업 요약(context)', '브랜치 병합 상태(branches)'],
    supplies: ['Source of Truth 존재', '작업 상태 근거'],
    required: false,
    scopes: ['이미 이 앱의 데이터입니다. 별도 권한이 없습니다.'],
    neverWrites: '읽기 전용으로만 조회합니다.',
  },
  {
    id: 'calendar',
    name: '캘린더',
    vendor: 'Google Calendar',
    role: '판정할 회의 요청이 여기서 들어옵니다. 이게 없으면 판정 대기 큐 자체가 비어 있습니다.',
    reads: ['예정된 회의의 제목 · 시각 · 길이', '참석 예정자 목록', '설명란의 안건', '이벤트 분류(1:1 · 브레인스토밍 등)'],
    supplies: ['회의 요청', '참석 예정 인원', '안건 수', '유형 표식'],
    required: true,
    scopes: ['캘린더 이벤트 읽기', '참석자 목록 읽기'],
    neverWrites: '일정을 만들거나 지우거나 초대를 보내지 않습니다.',
  },
  {
    id: 'jira',
    name: '이슈트래커',
    vendor: 'Atlassian Jira',
    role: '"됐나요?" 의 답이 실제로 들어 있는 곳입니다. 조건 판정의 주 근거입니다.',
    reads: ['이슈 상태와 완료 개수', '체크리스트 · 서브태스크', '결함 등급(P1 등)', '최종 갱신 시각'],
    supplies: ['Source of Truth 존재', '데이터 최신', '해석 모호성 없음', 'Prerequisite 충족'],
    required: false,
    scopes: ['이슈 읽기', '프로젝트 메타데이터 읽기'],
    neverWrites: '이슈 상태를 바꾸거나 코멘트를 남기지 않습니다.',
  },
  {
    id: 'github',
    name: '코드 저장소',
    vendor: 'GitHub',
    role: '브랜치 병합 여부처럼 사람 말보다 정확한 상태를 읽습니다.',
    reads: ['PR 상태 · 리뷰 승인', '브랜치 병합 여부', 'CODEOWNERS(관련자 판단)'],
    supplies: ['담당자 확정', '브랜치 병합 상태'],
    required: false,
    scopes: ['저장소 읽기', 'PR 읽기'],
    neverWrites: 'PR 을 머지하거나 코멘트를 남기지 않습니다.',
  },
  {
    id: 'alerts',
    name: '장애 알림',
    vendor: 'Sentry · Discord',
    role: '서버가 500을 뱉는 순간이 회의보다 먼저 도착합니다. 문제 해결 회의의 유일한 객관적 근거입니다.',
    reads: [
      '5xx · 예외 발생량과 추이',
      '알림 채널(#incident)에 뜬 장애 스레드',
      '영향 범위 — 엔드포인트 · 영향받은 사용자 수',
      '배포 시각과 오류 급증 시각의 상관',
    ],
    supplies: ['증상 재현·계측됨'],
    required: false,
    scopes: ['프로젝트 이슈 · 오류 이벤트 읽기', '알림 채널 메시지 읽기'],
    neverWrites: '알림을 지우거나 채널에 글을 쓰지 않습니다.',
  },
];

export const CONNECTOR_BY_ID: Record<ConnectorId, Connector> =
  Object.fromEntries(CONNECTORS.map((c) => [c.id, c])) as Record<ConnectorId, Connector>;

/**
 * 초기 연결 상태.
 *
 * TeamSync 는 이 저장소의 테이블이라 처음부터 붙어 있다 — 유일하게 실물이 있는 소스다.
 * GitHub 만 일부러 끊어 둔다. 연결하면 근거가 실제로 하나 늘어나는 것을 보이기 위해서다.
 */
export function buildSeedConnections(now: number): Record<ConnectorId, ConnectionState> {
  const on = (label: string, hoursAgo: number, syncedHoursAgo: number): ConnectionState => ({
    status: 'CONNECTED', accountLabel: label,
    connectedAt: iso(now, -hoursAgo), lastSyncAt: iso(now, -syncedHoursAgo),
  });
  const off: ConnectionState = {
    status: 'DISCONNECTED', accountLabel: null, connectedAt: null, lastSyncAt: null,
  };
  return {
    teamsync: on('unithon · Claude Code 훅', 24 * 30, 0.02),
    calendar: on('release-team@company.com', 24 * 12, 0.05),
    jira: on('COMMERCE 프로젝트', 24 * 12, 0.4),
    github: off,
    alerts: on('#incident · commerce-api', 24 * 6, 0.08),
  };
}

export function buildScenarios(now: number): Scenario[] {
  const ev = (
    id: string, source: Evidence['source'], sourceRef: string,
    kind: Evidence['kind'], summary: string, observedHoursAgo: number, freshForHours?: number,
  ): Evidence => ({
    id, source, sourceRef, kind, summary,
    observedAt: iso(now, -observedHoursAgo),
    freshUntil: freshForHours ? iso(now, -observedHoursAgo + freshForHours) : undefined,
  });

  return [
    // ── T1 · 전부 충족 → 회의가 사라진다 ────────────────────────────
    {
      id: 'sc-weekly-sync',
      slug: 'weekly-product-sync',
      title: '주간 제품 싱크',
      description: '8명이 각자 상태를 말하는 30분. 안건 8건 중 결정 안건은 0건입니다.',
      scheduledAt: iso(now, 18),
      requestedBy: '박현우 · 릴리즈 매니저',
      attendeeCount: 8, plannedMinutes: 30, agendaCount: 8,
      explicitTypeMarker: null,
      typeCandidates: [
        { type: 'STATUS', score: 0.91 },
        { type: 'PLANNING', score: 0.34 },
        { type: 'DECISION', score: 0.12 },
      ],
      typeRationale: '안건 8건이 전부 상태 전달이고 질의·결정 안건이 0건입니다.',
      evidence: [
        ev('ev-ws-1', 'teamsync', 'context:412', 'TASK_STATUS', '결제 모듈 리팩터링 — feature/payment 병합 완료', 1, 24),
        ev('ev-ws-2', 'teamsync', 'context:409', 'TASK_STATUS', '알림 센터 API 8/8 엔드포인트 구현 완료', 2, 24),
        ev('ev-ws-3', 'jira', 'jira:PAY-118', 'TASK_STATUS', 'Task 24건 중 완료 24건 · 미확인 0건', 1, 24),
        ev('ev-ws-4', 'alerts', 'alerts:commerce-api', 'ALERT', '최근 24시간 5xx 알림 0건 · #incident 조용함', 1, 12),
      ],
      liveFields: [
        { key: 'sourceOfTruthExists', label: 'Source of Truth 존재', kind: 'boolean', hint: 'Jira · GitHub 연결 여부' },
        { key: 'lastUpdatedHours', label: '최종 갱신', kind: 'number', min: 0, max: 96, step: 1, unit: '시간 전' },
        { key: 'freshWithinHours', label: '최신성 기준', kind: 'number', min: 1, max: 72, step: 1, unit: '시간 이내', hint: '조직이 정하는 값입니다. 하나의 숫자를 모든 업무에 쓰지 않습니다.' },
        { key: 'ambiguousStatusCount', label: '해석 모호한 상태', kind: 'number', min: 0, max: 5, step: 1, unit: '건' },
        { key: 'questionAgendaCount', label: '질의형 안건', kind: 'number', min: 0, max: 5, step: 1, unit: '건' },
        { key: 'decisionAgendaCount', label: '결정 안건', kind: 'number', min: 0, max: 5, step: 1, unit: '건' },
      ],
      liveData: {
        sourceOfTruthExists: true, lastUpdatedHours: 1, freshWithinHours: 3,
        ambiguousStatusCount: 0, questionAgendaCount: 0, decisionAgendaCount: 0,
      },
      patternKey: null,
      spotlight: '조건 5개 전부 충족 → 회의 없음',
    },

    // ── T1 · 한 항목 때문에 DELETE 가 아니라 ASYNC ─────────────────
    {
      id: 'sc-status-ambiguous',
      slug: 'weekly-status-ambiguous',
      title: '주간 진행상황 공유',
      description: '상태 한 건의 의미가 불명확합니다. "진행률 80%" 가 핵심 기능 완료를 뜻하는지 알 수 없습니다.',
      scheduledAt: iso(now, 26),
      requestedBy: '이수진 · PM',
      attendeeCount: 8, plannedMinutes: 30, agendaCount: 5,
      explicitTypeMarker: null,
      typeCandidates: [
        { type: 'STATUS', score: 0.88 },
        { type: 'PLANNING', score: 0.29 },
      ],
      typeRationale: '상태 전달이 목적이며 결정 안건이 없습니다.',
      evidence: [
        ev('ev-sa-1', 'teamsync', 'context:398', 'TASK_STATUS', '검색 개편 — "진행률 80%" 로만 보고됨', 5, 72),
        ev('ev-sa-2', 'jira', 'jira:SRCH-77', 'TASK_STATUS', 'Task 10건 중 완료 7건 · 진행 중 2건 · 미확인 1건', 2, 24),
        ev('ev-sa-3', 'teamsync', 'context:401', 'BRANCH_STATE', 'feature/search-rank 미병합 · 마지막 커밋 5시간 전', 5, 24),
      ],
      liveFields: [
        { key: 'sourceOfTruthExists', label: 'Source of Truth 존재', kind: 'boolean' },
        { key: 'lastUpdatedHours', label: '최종 갱신', kind: 'number', min: 0, max: 96, step: 1, unit: '시간 전' },
        { key: 'freshWithinHours', label: '최신성 기준', kind: 'number', min: 1, max: 72, step: 1, unit: '시간 이내' },
        { key: 'ambiguousStatusCount', label: '해석 모호한 상태', kind: 'number', min: 0, max: 5, step: 1, unit: '건', hint: '0으로 내리면 판정이 바뀝니다.' },
        { key: 'questionAgendaCount', label: '질의형 안건', kind: 'number', min: 0, max: 5, step: 1, unit: '건' },
        { key: 'decisionAgendaCount', label: '결정 안건', kind: 'number', min: 0, max: 5, step: 1, unit: '건' },
      ],
      liveData: {
        sourceOfTruthExists: true, lastUpdatedHours: 2, freshWithinHours: 3,
        ambiguousStatusCount: 1, questionAgendaCount: 0, decisionAgendaCount: 0,
      },
      patternKey: null,
      spotlight: '4/5 충족 → 이 항목 하나 때문에 ASYNC',
    },

    // ── T2 · 조건은 다 됐고 가치판단만 남았다 ──────────────────────
    {
      id: 'sc-release-gonogo',
      slug: 'release-go-nogo',
      title: '5.2 릴리즈 Go / No-Go',
      description: 'QA·디자인·API 조건은 모두 충족했습니다. 결제 도메인 P1 결함 1건만 남았습니다.',
      scheduledAt: iso(now, 5),
      requestedBy: '박현우 · 릴리즈 매니저',
      attendeeCount: 6, plannedMinutes: 45, agendaCount: 4,
      explicitTypeMarker: null,
      typeCandidates: [
        { type: 'DECISION', score: 0.94 },
        { type: 'STATUS', score: 0.31 },
      ],
      typeRationale: '출시 여부라는 단일 결정 안건이 있고 나머지 안건은 그 근거입니다.',
      evidence: [
        ev('ev-rg-1', 'jira', 'jira:REL-52', 'TASK_STATUS', 'QA 체크리스트 12건 중 12건 완료', 1, 12),
        ev('ev-rg-2', 'teamsync', 'context:420', 'TASK_STATUS', '디자인 QA 반영 완료 — feature/checkout-ui 병합됨', 2, 24),
        ev('ev-rg-3', 'jira', 'jira:PAY-201', 'TASK_STATUS', '결제 도메인 P1 결함 1건 잔존 · 우회 경로 있음', 1, 12),
        ev('ev-rg-4', 'alerts', 'alerts:staging-5xx', 'ALERT', '스테이징 5xx 알림 0건 · 48시간', 1, 12),
        ev('ev-rg-5', 'github', 'github:PR-812', 'BRANCH_STATE', 'release/5.2 PR 리뷰 승인 2/2 · 병합됨', 2, 24),
      ],
      liveFields: [
        { key: 'qaCompleted', label: 'QA 체크리스트 완료', kind: 'number', min: 0, max: 12, step: 1, unit: '/ 12건' },
        { key: 'lastUpdatedHours', label: '최종 갱신', kind: 'number', min: 0, max: 96, step: 1, unit: '시간 전' },
        { key: 'freshWithinHours', label: '최신성 기준', kind: 'number', min: 1, max: 72, step: 1, unit: '시간 이내' },
        { key: 'openValueJudgments', label: '남은 가치판단', kind: 'number', min: 0, max: 3, step: 1, unit: '건' },
        { key: 'optionCount', label: '정의된 선택지', kind: 'number', min: 0, max: 4, step: 1, unit: '개' },
      ],
      liveData: {
        qaCompleted: 12, lastUpdatedHours: 1, freshWithinHours: 12,
        openValueJudgments: 1, optionCount: 2,
      },
      patternKey: 'minor-release-p1-defect',
      spotlight: '조건 충족 + 가치판단 1건 → 결정 카드',
    },

    // ── T3 · 가설이 경합한다. AI 가 스스로 손을 든다 ────────────────
    {
      id: 'sc-payment-spike',
      slug: 'payment-failure-spike',
      title: '결제 실패율 급증 원인 조사',
      description: '원인 가설 3개가 경합 중입니다. 1위 0.41 · 2위 0.36 — 차이가 0.20 미만입니다.',
      scheduledAt: iso(now, 2),
      requestedBy: '김서영 · 결제 모듈 소유자',
      attendeeCount: 5, plannedMinutes: 30, agendaCount: 10,
      explicitTypeMarker: null,
      typeCandidates: [
        { type: 'PROBLEM_SOLVING', score: 0.89 },
        { type: 'CONFLICT_CRISIS', score: 0.42 },
      ],
      typeRationale: '증상이 특정되어 있고 원인 규명이 목적입니다.',
      evidence: [
        ev('ev-ps-1', 'alerts', 'alerts:pay-5xx', 'ALERT', '결제 API 5xx 급증 — 실패율 0.4% → 3.1% · #incident 알림 12건 (10:20 이후)', 1, 6),
        ev('ev-ps-2', 'teamsync', 'context:431', 'BRANCH_STATE', '10:20 release/pay-hotfix 배포 — 수행자 지우', 1, 24),
        ev('ev-ps-3', 'alerts', 'alerts:pay-thread', 'ALERT', '#incident 스레드에 정리된 원인 가설 — A 0.41 · B 0.36 · C 0.23', 0.5, 6),
        ev('ev-ps-4', 'jira', 'jira:CPN-14', 'AGENDA', '안건 C 쿠폰 정산 로직 — 관련자 2명', 3, 48),
      ],
      liveFields: [
        { key: 'hypothesisTop', label: '1위 가설 점수', kind: 'number', min: 0, max: 1, step: 0.01, unit: '' },
        { key: 'hypothesisSecond', label: '2위 가설 점수', kind: 'number', min: 0, max: 1, step: 0.01, unit: '', hint: '두 값의 차가 0.20 이상이면 자동 처리로 넘어갑니다.' },
        { key: 'symptomReproducible', label: '증상 재현됨', kind: 'boolean' },
        { key: 'ownerIdentified', label: '담당자 확정됨', kind: 'boolean' },
        { key: 'lastUpdatedHours', label: '최종 갱신', kind: 'number', min: 0, max: 24, step: 1, unit: '시간 전' },
        { key: 'freshWithinHours', label: '최신성 기준', kind: 'number', min: 1, max: 24, step: 1, unit: '시간 이내' },
      ],
      liveData: {
        hypothesisTop: 0.41, hypothesisSecond: 0.36, symptomReproducible: true,
        ownerIdentified: true, lastUpdatedHours: 1, freshWithinHours: 6,
      },
      patternKey: null,
      spotlight: '가설 경합 → AI 가 사람에게 넘김 · 5명 30분 → 3명 12분',
    },

    // ── T6 · 제목조차 읽지 않는다 ───────────────────────────────────
    {
      id: 'sc-1on1',
      slug: 'perf-feedback-1on1',
      title: '1:1 성과 피드백',
      description: '캘린더 분류가 1:1 입니다. 이 요청은 분해 파이프라인에 들어가지 않습니다.',
      scheduledAt: iso(now, 30),
      requestedBy: '박현우 · 릴리즈 매니저',
      attendeeCount: 2, plannedMinutes: 30, agendaCount: 0,
      explicitTypeMarker: 'FEEDBACK_1ON1',
      typeCandidates: [{ type: 'FEEDBACK_1ON1', score: 1 }],
      typeRationale: '캘린더 분류가 1:1 입니다. 제목과 본문은 읽지 않았습니다.',
      evidence: [],
      liveFields: [],
      liveData: {},
      patternKey: null,
      spotlight: '분석 대상이 아님 → 항상 MEET',
    },

    // ── T8 · 억지로 하나를 고르지 않는다 ───────────────────────────
    {
      id: 'sc-unclear',
      slug: 'sprint-sync-unclear',
      title: '스프린트 싱크',
      description: '목적 문장이 없고 안건도 비어 있습니다. 후보 1·2위 차가 0.03 입니다.',
      scheduledAt: iso(now, 20),
      requestedBy: '지우 · 백엔드',
      attendeeCount: 7, plannedMinutes: 60, agendaCount: 0,
      explicitTypeMarker: null,
      typeCandidates: [
        { type: 'STATUS', score: 0.44 },
        { type: 'PLANNING', score: 0.41 },
        { type: 'DECISION', score: 0.22 },
      ],
      typeRationale: '상태 공유와 일정 조율 중 무엇이 목적인지 입력으로는 가릴 수 없습니다.',
      evidence: [
        ev('ev-uc-1', 'calendar', 'calendar:evt-88', 'AGENDA', '안건 0건 · 설명 없음 · 반복 일정', 6, 168),
      ],
      liveFields: [],
      liveData: {},
      patternKey: null,
      spotlight: '점수 경합 0.03 → 추측하지 않고 되묻는다',
    },
  ];
}

// ── 시나리오별로 사람이 미리 써 둔 산출물 문안 ───────────────────
// 실제 서비스에서는 이 자리를 AI-002 가 채운다. 다만 AI 는 여기 없는 사람·선택지·
// 안건을 만들어낼 수 없다 — allowlist 를 넘는 응답은 폐기하고 템플릿으로 대체한다.
export type Authored = {
  resolution?: Partial<ResolutionLogContent>;
  decision?: DecisionCardContent;
  prescription?: Partial<MeetingPrescriptionContent>;
};

export function buildAuthored(now: number): Record<string, Authored> {
  return {
    'weekly-product-sync': {
      resolution: {
        summary: '안건 8건이 전부 확인 가능한 상태였습니다. 8명이 모여 서로에게 물어볼 것이 없습니다.',
        resolvedByData: [
          '결제 모듈 리팩터링 — 병합 완료 (context:412)',
          '알림 센터 API — 8/8 구현 완료 (context:409)',
          '5.2 릴리즈 Task — 24/24 완료 (jira:PAY-118)',
          'main 빌드 — success · P1 0건 (ci:build#2041)',
          '검색 개편 — 다음 스프린트로 이월 확정',
          '온보딩 개편 — 디자인 QA 대기',
        ],
        resolvedByPolicy: [
          '릴리즈 노트 초안 승인 — 마이너 릴리즈는 릴리즈 매니저 단독 승인 (정책)',
          '스테이징 데이터 초기화 — 주 1회 자동 (정책)',
        ],
        followUpCondition: 'P1 결함이 새로 등록되거나 빌드가 실패하면 다시 판정합니다.',
      },
    },

    'weekly-status-ambiguous': {
      resolution: {
        summary: '안건 4건은 데이터로 확정했습니다. 남은 1건은 모여서 물어볼 것이 아니라 상태 표기를 고치면 사라집니다.',
        resolvedByData: [
          '알림 센터 API — 8/8 구현 완료',
          'feature/search-rank — 미병합 · 마지막 커밋 5시간 전',
          '온보딩 개편 — 디자인 QA 대기',
          '5.2 릴리즈 — 회귀 테스트 통과',
        ],
        resolvedByPolicy: [],
        followUpCondition: '검색 개편의 진행률 표기가 Task 단위로 바뀌면 다시 판정합니다.',
      },
    },

    'release-go-nogo': {
      decision: {
        question: '결제 도메인 P1 결함 1건을 남긴 채 5.2를 예정대로 출시할까요?',
        whyYou:
          '캠페인 일정과 결제 품질 중 무엇을 우선할지는 어떤 기준 문서에도 정의되어 있지 않습니다. ' +
          'QA·디자인·API 조건은 이미 전부 충족했고, 남은 것은 조건이 아니라 판단입니다.',
        deciderRole: '릴리즈 매니저',
        dueAt: iso(now, 4),
        options: [
          {
            key: 'delay_for_quality',
            label: '품질 보강 후 출시 (48시간 연기)',
            pros: ['결제 실패 경로가 사용자에게 노출되지 않음', '우회 경로 안내 CS 비용 0'],
            cons: ['캠페인 시작이 이틀 밀림 · 사전 예약 12,400건 재공지 필요'],
            evidenceIds: ['ev-rg-3'],
          },
          {
            key: 'ship_on_schedule',
            label: '현재 범위로 일정 유지',
            pros: ['캠페인 일정 그대로 · 재공지 비용 0'],
            cons: ['P1 결함 우회 경로 안내 필요 · 결제 이탈 추정 1~2%'],
            evidenceIds: ['ev-rg-1', 'ev-rg-4'],
          },
        ],
        recommendedKey: 'delay_for_quality',
        recommendationScore: 0.71,
        prerequisites: ['QA 체크리스트 12/12', '디자인 QA 반영 완료', '회귀 테스트 통과'],
      },
    },

    'payment-failure-spike': {
      prescription: {
        purpose: '결제 실패율 급증의 원인을 확정하고 롤백 여부를 결정합니다.',
        reason: '원인 가설 3개가 경합 중입니다 (0.41 vs 0.36). 데이터로는 하나를 고를 수 없습니다.',
        attendees: [
          { key: 'jiwoo', name: '지우', role: '10:20 배포 수행자', relevance: 0.94, included: true, reason: '실패가 시작된 배포를 직접 수행했습니다.' },
          { key: 'seoyoung', name: '김서영', role: '결제 모듈 소유자', relevance: 0.91, included: true, reason: '실패 로그가 발생한 코드의 소유자입니다.' },
          { key: 'hyunwoo', name: '박현우', role: '롤백 결정권자', relevance: 0.88, included: true, reason: '롤백은 이 사람의 권한입니다.' },
          { key: 'sujin', name: '이수진', role: 'PM', relevance: 0.12, included: false, reason: '영향 범위 밖입니다. 결과만 받으면 됩니다.' },
          { key: 'minseo', name: '민서', role: '마케팅 리드', relevance: 0.08, included: false, reason: '영향 범위 밖입니다. 결과만 받으면 됩니다.' },
        ],
        agendas: [
          { title: '가설 A · B 중 원인 확정 — 배포 diff 대조', minutes: 8, evidenceIds: ['ev-ps-2', 'ev-ps-3'] },
          { title: '롤백 여부 결정', minutes: 4, evidenceIds: ['ev-ps-1'] },
        ],
        splitOff: [
          { title: '안건 C · 쿠폰 정산 로직', reason: '관련자가 2명뿐입니다. 이 회의에 3명을 더 앉힐 이유가 없습니다.', minutes: 15 },
        ],
        preReads: [
          '10:20 배포 diff (release/pay-hotfix)',
          '실패 로그 상위 20건 · 에러 코드 분포',
          '가설 A/B/C 요약 한 장',
        ],
        exitCriteria: [
          '실패 원인이 가설 A 또는 B 로 확정되었다',
          '롤백 여부와 수행자·시각이 정해졌다',
        ],
      },
    },

    'perf-feedback-1on1': {
      prescription: {
        purpose: '확인 필요',
        reason: '이 유형은 분석하지 않습니다. 안건을 분해하거나 참석자를 조정하지 않습니다.',
        attendees: [],
        agendas: [],
        splitOff: [],
        preReads: [],
        exitCriteria: ['이 회의의 종료 조건은 시스템이 정하지 않습니다.'],
      },
    },

  };
}

// ── 이미 쌓여 있는 원장 ───────────────────────────────────────────
export function buildSeedLedger(now: number): LedgerEntry[] {
  const day = 24;
  return [
    {
      id: 'lg-seed-1', eventType: 'DECIDED', outcome: 'DECIDE', actor: '박현우 · 릴리즈 매니저',
      title: '4.9 릴리즈 · 인증 P1 결함 잔존', summary: '품질 보강 후 출시를 선택했습니다.',
      occurredAt: iso(now, -day * 45), evaluationId: null, ruleVersion: RULE_VERSION,
      patternKey: 'minor-release-p1-defect', selectedOptionKey: 'delay_for_quality',
    },
    {
      id: 'lg-seed-2', eventType: 'DECIDED', outcome: 'DECIDE', actor: '박현우 · 릴리즈 매니저',
      title: '5.0 릴리즈 · 결제 P1 결함 잔존', summary: '품질 보강 후 출시를 선택했습니다.',
      occurredAt: iso(now, -day * 16), evaluationId: null, ruleVersion: RULE_VERSION,
      patternKey: 'minor-release-p1-defect', selectedOptionKey: 'delay_for_quality',
    },
    {
      id: 'lg-seed-3', eventType: 'EVALUATED', outcome: 'DELETE', actor: '시스템',
      title: '스테이징 점검 싱크', summary: '조건 5개 전부 충족 · 6명 × 20분 절약.',
      occurredAt: iso(now, -day * 7), evaluationId: null, ruleVersion: RULE_VERSION,
    },
    {
      id: 'lg-seed-4', eventType: 'REVERTED', outcome: 'DECIDE', actor: '이수진 · PM',
      title: '검색 개편 · 범위 축소 결정', summary: '되돌림 — 축소 범위가 계약 요건을 빠뜨렸습니다.',
      occurredAt: iso(now, -day * 4), evaluationId: null, ruleVersion: RULE_VERSION,
      patternKey: 'scope-cut-on-slip', selectedOptionKey: 'cut_scope',
    },
    {
      id: 'lg-seed-5', eventType: 'EVALUATED', outcome: 'ASYNC', actor: '시스템',
      title: '인프라 주간 공유', summary: '최신성 게이트 미충족 · 해결 로그로 종료.',
      occurredAt: iso(now, -day * 2), evaluationId: null, ruleVersion: RULE_VERSION,
    },
  ];
}

// ── 정책 후보 ─────────────────────────────────────────────────────
// 같은 판단이 세 번 반복되면 후보가 된다. 지금은 2건 — 한 건이 모자란다.
// 5.2 릴리즈 결정 카드에서 '품질 보강'을 고르면 그 자리에서 3건이 된다.
export function buildSeedPolicies(now: number): Policy[] {
  const day = 24;
  const d = (h: number) => iso(now, h).slice(0, 10);
  return [
    {
      id: 'pol-quality-first',
      patternKey: 'minor-release-p1-defect',
      selectedOptionKey: 'delay_for_quality',
      status: 'CANDIDATE',
      title: '품질 우선',
      rule: '결제·인증 도메인의 P1 결함이 잔존할 경우, 캠페인 일정보다 품질을 우선한다.',
      exception: '위약금이 분기 예산의 5%를 초과하는 경우 재검토한다.',
      decisionCount: 2,
      threshold: 3,
      sourceDecisions: [
        { id: 'lg-seed-1', date: d(-day * 45), title: '4.9 릴리즈 · 인증 P1 결함 잔존' },
        { id: 'lg-seed-2', date: d(-day * 16), title: '5.0 릴리즈 · 결제 P1 결함 잔존' },
      ],
      activatedBy: null,
      activatedAt: null,
    },
  ];
}
