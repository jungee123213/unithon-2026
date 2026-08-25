/**
 * NO MEETING — 회의 판정 도메인 계약 (UI 목업 단계)
 *
 * docs/06_DATABASE.md 의 enum 과 같은 문자열을 쓴다. 나중에 DB·API 가 붙어도
 * 화면 코드를 다시 쓰지 않기 위해서다. 지금은 이 타입의 값을 목 엔진이 만들고,
 * 나중에는 서버가 만든다. 화면 입장에서는 출처만 바뀐다.
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

// 조건을 실제로 검사하는 건 T1·T2·T3 이다. T5·T6 은 표식만으로 회의를 열고,
// T8 은 결론을 내지 않는다. T4·T7 은 아직 규칙이 정해지지 않아 시나리오가 없다.

/** 판정 결과 5종. 산출물은 3종이고 outcome 이 5종이다. */
export type Outcome = 'DELETE' | 'ASYNC' | 'DECIDE' | 'SHRINK' | 'MEET';

export type GateStatus = 'PASS' | 'FAIL' | 'UNKNOWN' | 'NOT_APPLICABLE';

export type DecisionStatus = 'PENDING' | 'DECIDED' | 'REVERTED';

export type PolicyStatus = 'CANDIDATE' | 'ACTIVE';

// ── 커넥터 ────────────────────────────────────────────────────────
/**
 * 이 제품은 스스로 사실을 만들지 않는다. 전부 남의 시스템에서 읽어 온다.
 * 그래서 무엇이 연결됐는지가 곧 무엇을 판정할 수 있는지다 —
 * 연결이 끊기면 조건이 FAIL 이 아니라 UNKNOWN 이 되고, UNKNOWN 이면 삭제하지 않는다.
 */
export type ConnectorId = 'teamsync' | 'calendar' | 'jira' | 'github' | 'alerts';

export type Connector = {
  id: ConnectorId;
  name: string;
  vendor: string;
  /** 이 소스가 없으면 무엇이 불가능해지는가 */
  role: string;
  /** 읽는 것 */
  reads: string[];
  /** 이 소스가 공급하는 것 — 판정 조건 또는 판정 입력 */
  supplies: string[];
  /** 연결이 없으면 판정 자체가 성립하지 않는가 */
  required: boolean;
  /** 목업 OAuth 동의 화면에 뜨는 권한 */
  scopes: string[];
  /** 쓰기는 하지 않는다. 무엇을 하지 않는지 화면에 명시한다. */
  neverWrites: string;
};

export type ConnectionState = {
  status: 'CONNECTED' | 'DISCONNECTED';
  accountLabel: string | null;
  connectedAt: string | null;
  lastSyncAt: string | null;
};

// ── 근거 ──────────────────────────────────────────────────────────
/**
 * 판정에 쓰인 사실 한 조각. `summary` 는 사람에게 보여주는 문장이고
 * 규칙 계산은 `value` 로만 한다 — LLM 이 "이 정도면 80%" 라고 추정하는 것을 막는 경계다.
 */
export type Evidence = {
  id: string;
  /** 어느 커넥터가 준 사실인가. 연결이 끊기면 이 근거는 스냅샷에서 빠진다. */
  source: ConnectorId | 'POLICY';
  sourceRef: string;          // context:42, jira:PAY-118, policy:...
  kind: 'TASK_STATUS' | 'BRANCH_STATE' | 'AGENDA' | 'ALERT' | 'POLICY_RULE';
  summary: string;
  observedAt: string;         // ISO
  freshUntil?: string;        // ISO — 지나면 최신성 게이트가 FAIL
};

// ── 게이트 ────────────────────────────────────────────────────────
export type GateCheck = {
  key: string;
  label: string;              // 화면에 뜨는 조건 이름
  status: GateStatus;
  ruleText: string;           // 판정 기준 — 왜 이렇게 나왔는지
  reason: string;             // 이번 입력에서 실제로 무슨 값이었는지
  evidenceIds: string[];
  /** 이 항목 하나가 결과를 어떻게 바꾸는지. FAIL 일 때만 채운다. */
  ifResolved?: string;
};

// ── 산출물 3종 ────────────────────────────────────────────────────
export type ResolutionLogContent = {
  summary: string;
  resolvedByData: string[];    // 데이터로 확정된 안건
  resolvedByPolicy: string[];  // 정책으로 판정된 안건
  savedPeople: number;
  savedMinutes: number;        // 1인당 분
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
  deciderRole: string;
  dueAt: string;
  options: DecisionOption[];
  recommendedKey: string | null;
  recommendationScore: number | null;  // 보정된 확률이 아니라 가설 점수
  /** 이미 시스템이 확인해서 다시 묻지 않는 것들. */
  prerequisites: string[];
};

export type Attendee = {
  key: string;
  name: string;
  role: string;
  relevance: number;           // 0..1
  included: boolean;
  reason: string;
};

export type MeetingPrescriptionContent = {
  purpose: string;
  reason: string;              // 왜 회의가 필요한가
  attendees: Attendee[];
  originalAttendeeCount: number;
  originalMinutes: number;
  agendas: { title: string; minutes: number; evidenceIds: string[] }[];
  splitOff: { title: string; reason: string; minutes: number }[];
  preReads: string[];
  exitCriteria: string[];
};

export type Artifact =
  | { type: 'RESOLUTION_LOG'; content: ResolutionLogContent }
  | { type: 'DECISION_CARD'; content: DecisionCardContent }
  | { type: 'MEETING_PRESCRIPTION'; content: MeetingPrescriptionContent };

// ── 판정 한 건 ────────────────────────────────────────────────────
export type Evaluation = {
  id: string;
  scenarioId: string;
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
  /** 이번 판정에 쓰인 Live Data 값. 재판정 비교용. */
  liveData: Record<string, number | boolean>;

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

// ── 시나리오(데모 입력) ───────────────────────────────────────────
export type LiveField =
  | { key: string; label: string; kind: 'number'; min: number; max: number; step: number; unit: string; hint?: string }
  | { key: string; label: string; kind: 'boolean'; hint?: string };

export type Scenario = {
  id: string;
  slug: string;
  title: string;
  description: string;
  scheduledAt: string;
  requestedBy: string;
  attendeeCount: number;
  plannedMinutes: number;
  agendaCount: number;
  /** T5·T6 은 본문을 읽지 않고 이 표식만으로 라우팅한다. */
  explicitTypeMarker: MeetingType | null;
  typeCandidates: { type: MeetingType; score: number }[];
  typeRationale: string;
  evidence: Evidence[];
  liveFields: LiveField[];
  liveData: Record<string, number | boolean>;
  patternKey: string | null;
  /** 이 시나리오가 보여주려는 대표 경로. Today 큐 정렬과 설명에 쓴다. */
  spotlight: string;
};
