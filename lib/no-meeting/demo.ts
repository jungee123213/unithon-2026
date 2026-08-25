import type { AgendaItem, Evidence, MeetingRequest } from './types';

/**
 * 데모 입력 — **아직 실물 커넥터가 없는 소스를 대신하는 자리**.
 *
 * 세션 요약 근거는 여기서 만들지 않는다. 실제 DB 에서 온다
 * (`lib/no-meeting/evidence-teamsync.ts`). 이 파일에 남아 있는 것은
 * Jira · GitHub · 알림 · 캘린더 몫이고, 그 커넥터가 붙는 날 통째로 사라진다.
 *
 * 값은 전부 `Evidence.facts` 에 실려 있다. 문장(`summary`)은 사람용이고
 * 게이트는 그것을 읽지 않는다.
 */

const H = 3_600_000;
const iso = (base: number, hours: number) => new Date(base + hours * H).toISOString();

const agenda = (id: string, title: string, kind: AgendaItem['kind'], evidenceIds: string[] = []): AgendaItem =>
  ({ id, title, kind, evidenceIds });

// ── 캘린더에서 온 것으로 가정하는 회의 요청 ───────────────────────

export function demoRequests(now: number): MeetingRequest[] {
  return [
    // T1 · 전부 충족 → 회의가 사라진다
    {
      id: 'rq-weekly-sync',
      source: 'CALENDAR',
      title: '주간 제품 싱크',
      purposeText: '이번 주 진행 상황을 각자 공유하고 다음 주 계획을 맞춥니다.',
      scheduledAt: iso(now, 18),
      requestedBy: '박현우',
      attendeeCandidates: ['박현우', '김지은', '지우', '이수진'],
      plannedMinutes: 30,
      createdAt: iso(now, -2),
      agenda: [
        agenda('ag-ws-1', '5.2 릴리즈 Task 소진 현황', 'INFO', ['ev-ws-3']),
        agenda('ag-ws-2', '커머스 API 알림 현황', 'INFO', ['ev-ws-4']),
      ],
      typeCandidates: [
        { type: 'STATUS', score: 0.91 },
        { type: 'PLANNING', score: 0.34 },
      ],
      typeRationale: '안건이 전부 상태 전달이고 질의·결정 안건이 0건입니다.',
      explicitTypeMarker: null,
      patternKey: null,
    },

    // T1 · 한 항목 때문에 DELETE 가 아니라 ASYNC
    {
      id: 'rq-status-ambiguous',
      source: 'CALENDAR',
      title: '주간 진행상황 공유',
      purposeText: '검색 개편이 어디까지 됐는지 확인하고 남은 일정을 봅니다.',
      scheduledAt: iso(now, 26),
      requestedBy: '이수진',
      attendeeCandidates: ['이수진', '지우', '김지은'],
      plannedMinutes: 30,
      createdAt: iso(now, -4),
      agenda: [
        agenda('ag-sa-1', '검색 개편 Task 소진 현황', 'INFO', ['ev-sa-3']),
      ],
      typeCandidates: [
        { type: 'STATUS', score: 0.88 },
        { type: 'PLANNING', score: 0.29 },
      ],
      typeRationale: '상태 전달이 목적이며 결정 안건이 없습니다.',
      explicitTypeMarker: null,
      patternKey: null,
    },

    // T2 · 조건은 다 됐고 가치판단만 남았다
    {
      id: 'rq-release-gonogo',
      source: 'CALENDAR',
      title: '5.2 릴리즈 Go / No-Go',
      purposeText: 'QA 가 끝났는지 확인하고, 결제 도메인 P1 결함을 안고 나갈지 정해야 합니다.',
      scheduledAt: iso(now, 5),
      requestedBy: '박현우',
      attendeeCandidates: ['박현우', '김서영', '이수진', '지우'],
      plannedMinutes: 45,
      createdAt: iso(now, -6),
      agenda: [
        agenda('ag-rg-1', 'QA 체크리스트 소진 확인', 'INFO', ['ev-rg-1']),
        agenda('ag-rg-2', '결제 도메인 P1 결함을 안고 출시할 것인가', 'DECISION', ['ev-rg-2']),
      ],
      typeCandidates: [
        { type: 'DECISION', score: 0.94 },
        { type: 'STATUS', score: 0.31 },
      ],
      typeRationale: '출시 여부라는 단일 결정 안건이 있고 나머지 안건은 그 근거입니다.',
      explicitTypeMarker: null,
      patternKey: 'minor-release-p1-defect',
    },

    // T3 · 가설이 경합한다. AI 가 스스로 손을 든다
    {
      id: 'rq-payment-spike',
      source: 'CALENDAR',
      title: '결제 실패율 급증 원인 조사',
      purposeText: '결제 API 5xx 가 급증했습니다. 원인을 좁혀야 합니다.',
      scheduledAt: iso(now, 2),
      requestedBy: '김서영',
      attendeeCandidates: ['김서영', '지우', '박현우', '이수진'],
      plannedMinutes: 30,
      createdAt: iso(now, -1),
      agenda: [
        agenda('ag-ps-1', '5xx 급증의 원인 규명', 'QUESTION', ['ev-ps-1', 'ev-ps-3']),
      ],
      typeCandidates: [
        { type: 'PROBLEM_SOLVING', score: 0.89 },
        { type: 'CONFLICT_CRISIS', score: 0.42 },
      ],
      typeRationale: '증상이 특정되어 있고 원인 규명이 목적입니다.',
      explicitTypeMarker: null,
      patternKey: null,
    },

    // T6 · 제목조차 읽지 않는다
    {
      id: 'rq-1on1',
      source: 'CALENDAR',
      title: '1:1 성과 피드백',
      purposeText: '',
      scheduledAt: iso(now, 30),
      requestedBy: '박현우',
      attendeeCandidates: ['박현우', '지우'],
      plannedMinutes: 30,
      createdAt: iso(now, -8),
      agenda: [],
      typeCandidates: [{ type: 'FEEDBACK_1ON1', score: 1 }],
      typeRationale: '캘린더 분류가 1:1 입니다. 제목과 본문은 읽지 않았습니다.',
      explicitTypeMarker: 'FEEDBACK_1ON1',
      patternKey: null,
    },

    // T8 · 억지로 하나를 고르지 않는다
    {
      id: 'rq-unclear',
      source: 'CALENDAR',
      title: '스프린트 싱크',
      purposeText: '',
      scheduledAt: iso(now, 20),
      requestedBy: '지우',
      attendeeCandidates: ['지우', '김지은', '이수진', '박현우'],
      plannedMinutes: 60,
      createdAt: iso(now, -12),
      agenda: [],
      typeCandidates: [
        { type: 'STATUS', score: 0.44 },
        { type: 'PLANNING', score: 0.41 },
      ],
      typeRationale: '상태 공유와 일정 조율 중 무엇이 목적인지 입력으로는 가릴 수 없습니다.',
      explicitTypeMarker: null,
      patternKey: null,
    },
  ];
}

// ── 아직 실물이 없는 커넥터가 공급했을 근거 ───────────────────────
/**
 * 요청 하나에 딸린 근거. **여기 있는 것은 전부 Jira · GitHub · 알림 몫이다.**
 * 세션 요약 근거는 실제 DB 에서 따로 붙는다.
 */
export function demoEvidence(now: number): Record<string, Evidence[]> {
  const ev = (
    id: string, source: Evidence['source'], sourceRef: string,
    kind: Evidence['kind'], summary: string, hoursAgo: number,
    facts?: Evidence['facts'],
  ): Evidence => ({ id, source, sourceRef, kind, summary, observedAt: iso(now, -hoursAgo), facts });

  return {
    'rq-weekly-sync': [
      ev('ev-ws-3', 'jira', 'jira:PAY-118', 'TASK_STATUS',
        'Task 24건 중 완료 24건 · 미확인 0건', 1, { taskDone: 24, taskTotal: 24 }),
      ev('ev-ws-4', 'alerts', 'alerts:commerce-api', 'ALERT',
        '최근 24시간 5xx 알림 0건 · #incident 조용함', 1, { alertCount: 0 }),
    ],
    'rq-status-ambiguous': [
      ev('ev-sa-3', 'jira', 'jira:SRCH-77', 'TASK_STATUS',
        'Task 10건 중 완료 7건 · 진행 중 2건 · 미확인 1건', 2, { taskDone: 7, taskTotal: 10 }),
    ],
    'rq-release-gonogo': [
      ev('ev-rg-1', 'jira', 'jira:REL-52', 'TASK_STATUS',
        'QA 체크리스트 12건 중 12건 완료', 1, { checklistDone: 12, checklistTotal: 12 }),
      ev('ev-rg-2', 'jira', 'jira:PAY-201', 'TASK_STATUS',
        '결제 도메인 P1 결함 1건 잔존 · 우회 경로 있음', 1, { openP1: 1, owner: '김서영' }),
      ev('ev-rg-3', 'alerts', 'alerts:staging-5xx', 'ALERT',
        '스테이징 5xx 알림 0건 · 48시간', 1, { alertCount: 0 }),
    ],
    'rq-payment-spike': [
      ev('ev-ps-1', 'alerts', 'alerts:pay-5xx', 'ALERT',
        '결제 API 5xx 급증 — 실패율 0.4% → 3.1% · #incident 알림 12건', 1, { alertCount: 12 }),
      ev('ev-ps-3', 'alerts', 'alerts:pay-thread', 'ALERT',
        '#incident 스레드에 사람이 정리해 둔 원인 가설 — A 0.41 · B 0.36 · C 0.23', 0.5,
        { hypothesisScores: [0.41, 0.36, 0.23], owner: '김서영' }),
    ],
    'rq-unclear': [],
    'rq-1on1': [],
  };
}
