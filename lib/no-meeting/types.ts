/**
 * NO MEETING — 회의 판정 도메인 계약
 *
 * 지키는 경계 하나: **규칙 계산은 구조화된 값(`EvidenceFacts`)으로만 한다.**
 * `summary` 는 사람에게 보여주는 문장이고, 엔진은 그것을 읽지 않는다.
 * LLM 이 "이 정도면 80%" 라고 추정한 값이 게이트에 들어오는 것을 막는 선이다.
 */

// ── 회의 유형 8종 (T1~T8) ────────────────────────────────────────
export type MeetingType =
  | 'STATUS'           // T1 정보 공유
  | 'DECISION'         // T2 의사결정
  | 'PROBLEM_SOLVING'  // T3 문제 해결
  | 'PLANNING'         // T4 조율/기획
  | 'BRAINSTORMING'    // T5 — 분해하지 않는다
  | 'FEEDBACK_1ON1'    // T6 — 제목조차 읽지 않는다
  | 'CONFLICT_CRISIS'  // T7 갈등/위기
  | 'UNCLASSIFIED';    // T8 미분류

/** 판정 결과 5종. 산출물은 3종이고 outcome 이 5종이다. */
export type Outcome = 'DELETE' | 'ASYNC' | 'DECIDE' | 'SHRINK' | 'MEET';

export type GateStatus = 'PASS' | 'FAIL' | 'UNKNOWN' | 'NOT_APPLICABLE';

export type DecisionStatus = 'PENDING' | 'DECIDED' | 'REVERTED';

export type PolicyStatus = 'CANDIDATE' | 'ACTIVE';

// ── 커넥터 ────────────────────────────────────────────────────────
/**
 * 이 제품은 스스로 사실을 만들지 않는다. 전부 남의 시스템에서 읽어 온다.
 * 연결이 끊기면 조건이 FAIL 이 아니라 UNKNOWN 이 되고, UNKNOWN 이면 삭제하지 않는다.
 */
export type ConnectorId = 'teamsync' | 'calendar' | 'jira' | 'github' | 'alerts';

export type Connector = {
  id: ConnectorId;
  name: string;
  vendor: string;
  role: string;
  reads: string[];
  supplies: string[];
  required: boolean;
  scopes: string[];
  neverWrites: string;
  /** 실물이 붙어 있는가. false 면 화면에 목업이라고 밝힌다. */
  live: boolean;
};

export type ConnectionState = {
  status: 'CONNECTED' | 'DISCONNECTED';
  accountLabel: string | null;
  connectedAt: string | null;
  lastSyncAt: string | null;
};

// ── 근거 ──────────────────────────────────────────────────────────
/**
 * 근거에 실린 구조화된 값. **게이트는 오직 이것만 읽는다.**
 *
 * 값이 없는 칸은 "0" 이 아니라 "모른다" 이다. 그래서 전부 optional 이고,
 * 파생 계층은 없는 칸을 만나면 UNKNOWN 을 만든다.
 */
export type EvidenceFacts = {
  /** Task 단위로 계산된 상태. 이 두 칸이 없는 TASK_STATUS 근거는 "모호" 로 센다. */
  taskDone?: number;
  taskTotal?: number;
  /** 선행 조건 체크리스트 (QA 등) */
  checklistDone?: number;
  checklistTotal?: number;
  /** 기준 브랜치 병합 여부 — git 이 알려준 사실 */
  merged?: boolean;
  /** 이 사실의 소유자. 담당자 확정 게이트가 읽는다. */
  owner?: string;
  /** 잔존 P1 결함 수 */
  openP1?: number;
  /** 장애 알림 건수 */
  alertCount?: number;
  /**
   * 이 근거를 **이미 주입받은** 팀원들 (injections 테이블).
   * 이 제품만 가진 사실이다 — 캘린더에도 이슈트래커에도 없다.
   * 아무도 못 받았으면 빈 배열이다. `undefined`(모름)와 구분한다.
   */
  deliveredTo?: string[];
  /** 이미 닫힌 질문의 답 (decisions.resolved_choice). 같은 질문을 두 번 묻지 않는다. */
  answeredChoice?: string;
  /**
   * 사람이 정리해 둔 원인 가설 점수. **AI 가 매긴 값을 여기 넣지 않는다.**
   * 실제 커넥터가 이 값을 주는 경우는 아직 없다 (목업 시나리오 전용).
   */
  hypothesisScores?: number[];
};

/**
 * 판정에 쓰인 사실 한 조각.
 * `summary` 는 사람용 문장, `facts` 는 기계용 값이다. 둘을 섞지 않는다.
 */
export type Evidence = {
  id: string;
  /** 어느 커넥터가 준 사실인가. 연결이 끊기면 이 근거는 스냅샷에서 빠진다. */
  source: ConnectorId | 'POLICY';
  sourceRef: string;          // context:42, jira:PAY-118, policy:...
  kind: 'TASK_STATUS' | 'BRANCH_STATE' | 'AGENDA' | 'ALERT' | 'DELIVERY' | 'ANSWER' | 'POLICY_RULE';
  summary: string;
  observedAt: string;         // ISO
  facts?: EvidenceFacts;
};

// ── 안건 ──────────────────────────────────────────────────────────
/**
 * 신청서 자유 텍스트를 분류기가 쪼갠 결과. 안건의 종류가 게이트 입력이 된다.
 *   INFO     확인하면 끝나는 것
 *   QUESTION 답이 아직 없는 질의
 *   DECISION 사람이 판단해야 하는 것
 */
export type AgendaKind = 'INFO' | 'QUESTION' | 'DECISION';

export type AgendaItem = {
  id: string;
  title: string;
  kind: AgendaKind;
  /** 이 안건과 짝지어진 근거. 분류기가 붙이지 못하면 빈 배열이다. */
  evidenceIds: string[];
};

// ── 게이트 ────────────────────────────────────────────────────────
export type GateCheck = {
  key: string;
  label: string;              // 화면에 뜨는 조건 이름
  status: GateStatus;
  ruleText: string;           // 판정 기준 — 왜 이렇게 나왔는지
  reason: string;             // 이번 입력에서 실제로 무슨 값이었는지
  /** 이 값을 만든 근거. 파생 계층이 채운다 — 화면이 고르지 않는다. */
  evidenceIds: string[];
  /** 이 항목 하나가 결과를 어떻게 바꾸는지. FAIL·UNKNOWN 일 때만 채운다. */
  ifResolved?: string;
};

// ── 산출물 3종 ────────────────────────────────────────────────────
export type ResolutionLogContent = {
  summary: string;
  resolvedByData: string[];    // 데이터로 확정된 안건
  resolvedByPolicy: string[];  // 정책으로 판정된 안건
  askedPeople: number;         // 신청자가 부르려던 인원 (자기신고)
  askedMinutes: number;        // 신청자가 잡으려던 시간 (자기신고)
  followUpCondition: string;
};

export type DecisionOption = {
  key: string;
  label: string;
  pros: string[];
  cons: string[];
  evidenceIds: string[];
};

export type DecisionCardContent = {
  question: string;
  whyYou: string;              // "왜 제가 받았나요" — 이게 없으면 투표 앱이다
  decider: Decider;
  dueAt: string;
  options: DecisionOption[];
  recommendedKey: string | null;
  /** 이미 시스템이 확인해서 다시 묻지 않는 것들. */
  prerequisites: string[];
};

/** 결정 수신자는 규칙으로 정한다. 왜 그 사람인지가 함께 있어야 한다. */
export type Decider = {
  member: string;
  /** 어떤 규칙으로 이 사람이 뽑혔는가 */
  rule: string;
  evidenceIds: string[];
  /**
   * 이 사람이 지난 결정에 답하기까지 걸린 시간의 중앙값.
   * 원장에서 센 값이라 추정이 아니다. 표본이 없으면 null.
   */
  typicalResponseHours: number | null;
  responseSampleCount: number;
};

export type Attendee = {
  key: string;
  name: string;
  reason: string;
  included: boolean;
};

export type MeetingPrescriptionContent = {
  purpose: string;
  reason: string;              // 왜 회의가 필요한가
  attendees: Attendee[];
  askedAttendees: string[];
  askedMinutes: number;
  agendas: { title: string; kind: AgendaKind; evidenceIds: string[] }[];
  splitOff: { title: string; reason: string }[];
  preReads: string[];
  exitCriteria: string[];
};

export type Artifact =
  | { type: 'RESOLUTION_LOG'; content: ResolutionLogContent }
  | { type: 'DECISION_CARD'; content: DecisionCardContent }
  | { type: 'MEETING_PRESCRIPTION'; content: MeetingPrescriptionContent };

// ── 큐에 올라오는 요청 한 건 ──────────────────────────────────────
/**
 * 사람이 올리는 것은 **주장** 이고, 판정에 쓰이는 사실은 커넥터가 준다.
 * 그래서 이 타입에는 신청자가 쓴 것만 있고 게이트 입력값이 없다.
 */
export type RequestSource = 'REQUEST' | 'CALENDAR';

export type MeetingRequest = {
  id: string;
  source: RequestSource;
  title: string;
  /** 신청자가 쓴 자유 텍스트. 분류기의 입력이다. */
  purposeText: string;
  scheduledAt: string;
  requestedBy: string;
  attendeeCandidates: string[];
  plannedMinutes: number;
  createdAt: string;

  // ── 분류기 산출 ──
  agenda: AgendaItem[];
  typeCandidates: { type: MeetingType; score: number }[];
  typeRationale: string;
  /** 캘린더 이벤트 분류나 신청서 체크로 유형이 못박힌 경우. 본문을 읽지 않는다. */
  explicitTypeMarker: MeetingType | null;
  /** 같은 판단이 반복되는지 세는 라벨. 분류기가 붙인다. */
  patternKey: string | null;
};

// ── 판정 한 건 ────────────────────────────────────────────────────
export type Evaluation = {
  id: string;
  requestId: string;
  title: string;
  scheduledAt: string;
  requestedAt: string;

  meetingType: MeetingType;
  /** 분류기 후보. 1·2위 차가 0.20 미만이면 확정하지 않고 T8 로 넘긴다. */
  typeCandidates: { type: MeetingType; score: number }[];
  typeRationale: string;
  clarificationQuestion: string | null;

  evidence: Evidence[];
  /** 연결이 끊겨 이번 판정에서 읽지 못한 소스. 화면에 그대로 밝힌다. */
  droppedSources: ConnectorId[];
  gateChecks: GateCheck[];

  /** T8(미분류)이면 결과를 내지 않는다. 추측한 결론보다 없는 결론이 낫다. */
  outcome: Outcome | null;
  artifact: Artifact | null;

  ruleVersion: string;

  // 결정 카드일 때만
  decisionStatus?: DecisionStatus;
  selectedOptionKey?: string | null;
  revertReason?: string | null;
  patternKey?: string | null;
};

// ── 원장 ──────────────────────────────────────────────────────────
export type LedgerEventType = 'EVALUATED' | 'DECIDED' | 'REVERTED' | 'POLICY_ACTIVATED';

export type LedgerEntry = {
  id: string;
  eventType: LedgerEventType;
  outcome: Outcome | null;
  actor: string;
  title: string;
  summary: string;
  occurredAt: string;
  evaluationId: string | null;
  ruleVersion: string;
  patternKey?: string | null;
  selectedOptionKey?: string | null;
};

// ── 정책 ──────────────────────────────────────────────────────────
export type Policy = {
  id: string;
  patternKey: string;
  selectedOptionKey: string;
  status: PolicyStatus;
  title: string;
  rule: string;
  exception: string | null;
  decisionCount: number;
  threshold: number;
  sourceDecisions: { id: string; date: string; title: string }[];
  activatedBy: string | null;
  activatedAt: string | null;
};
