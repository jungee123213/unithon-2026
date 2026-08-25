import { deriveFacts, type Derived, type DerivedFacts } from './derive';
import { HYPOTHESIS_GAP_THRESHOLD, RULE_VERSION, TYPE_GAP_THRESHOLD } from './settings';
import type {
  Artifact, Attendee, ConnectorId, Decider, DecisionOption, Evaluation,
  Evidence, GateCheck, GateStatus, MeetingRequest, MeetingType, Outcome, Policy,
} from './types';

/**
 * 판정 엔진.
 *
 * 지키는 경계:
 *   - 게이트는 파생 계층이 계산한 값으로만 판정한다. 문장을 읽지 않는다.
 *   - 값이 없으면 UNKNOWN 이고, UNKNOWN 이 있으면 삭제하지 않는다.
 *   - 게이트가 다는 근거는 그 값을 실제로 만든 근거다. 골라 붙이지 않는다.
 *   - 유형만으로 경로가 정해지는 T5·T6·T8 은 조건을 검사하지 않는다.
 */

/** 파생값 하나를 게이트 한 줄로. 값이 없으면 자동으로 UNKNOWN 이 된다. */
function gate<T>(
  key: string,
  label: string,
  d: Derived<T>,
  ruleText: string,
  pass: (v: T) => boolean,
  ifResolved?: (v: T | null) => string | undefined,
): GateCheck {
  const status: GateStatus = d.value === null ? 'UNKNOWN' : pass(d.value) ? 'PASS' : 'FAIL';
  return {
    key,
    label,
    status,
    ruleText,
    reason: d.note,
    evidenceIds: d.evidenceIds,
    ifResolved: status === 'PASS' ? undefined : ifResolved?.(d.value),
  };
}

// ── 유형별 게이트 ─────────────────────────────────────────────────

function statusGates(f: DerivedFacts): GateCheck[] {
  return [
    gate('source_of_truth_exists', 'Source of Truth 존재', f.structuredState,
      '안건의 상태를 Task 단위로 확인할 수 있어야 한다.',
      (v) => v,
      () => '이슈트래커를 연결하거나 상태를 완료/전체로 기록하면 나머지 조건을 검사할 수 있습니다.'),

    gate('data_fresh', '데이터 최신', f.lastUpdatedHours,
      `최종 갱신이 ${f.freshWithinHours}시간 이내여야 한다.`,
      (v) => v <= f.freshWithinHours,
      (v) => v === null ? '상태를 기록하면 이 조건을 검사할 수 있습니다.'
        : `갱신 주기를 ${f.freshWithinHours}시간 이내로 줄이면 이 조건이 해소됩니다.`),

    gate('no_ambiguity', '해석 모호성 없음', f.ambiguousStatusCount,
      '모든 상태 근거가 Task 단위(완료/전체)로 계산되어야 한다.',
      (v) => v === 0,
      () => '진행률 표기를 Task 단위로 바꾸면 이 조건이 해소됩니다.'),

    // 이 제품만 가진 조건 — 요약이 이미 동료 에이전트에게 흘러갔는가.
    gate('already_delivered', '이미 전달됨', f.undelivered,
      '참석 후보 전원이 이 내용을 이미 주입받았어야 한다.',
      (v) => v.length === 0,
      (v) => v === null ? '주입 기록이 쌓이면 이 조건을 검사할 수 있습니다.'
        : `${v.join(' · ')} 에게 먼저 흘려보내면 모일 이유가 사라집니다.`),

    gate('no_immediate_discussion', '즉시 토론 불필요', f.agendaCounts,
      '답이 아직 없는 질의형 안건이 0건이어야 한다.',
      (v) => v.question === 0,
      () => '질의 안건을 담당자에게 비동기로 먼저 보내면 해소됩니다.'),

    gate('no_new_decision', '새 결정 없음', f.agendaCounts,
      '새로 내려야 할 결정이 0건이어야 한다.',
      (v) => v.decision === 0,
      () => '이 건은 회의가 아니라 결정 카드로 처리됩니다.'),
  ];
}

function decisionGates(f: DerivedFacts, policy: Policy | null): GateCheck[] {
  return [
    gate('prerequisites_complete', 'Prerequisite 충족', f.checklist,
      '다음 단계 진행에 필요한 선행 조건이 전부 완료여야 한다.',
      (v) => v.total > 0 && v.done >= v.total,
      (v) => v === null ? '이슈트래커를 연결하면 체크리스트를 읽을 수 있습니다.'
        : `NO-GO 사유입니다. 남은 ${v.total - v.done}건이 끝나면 다시 판정합니다.`),

    gate('data_fresh', '데이터 최신', f.lastUpdatedHours,
      `최종 갱신이 ${f.freshWithinHours}시간 이내여야 한다.`,
      (v) => v <= f.freshWithinHours,
      () => '상태를 갱신하고 다시 판정합니다.'),

    gate('single_value_judgment', '남은 가치판단 1건', f.openValueJudgments,
      '조건 판정을 걷어내고 남은 가치판단이 정확히 1건이어야 한다.',
      (v) => v === 1,
      (v) => v === null ? '안건을 분해할 수 있어야 이 조건을 검사합니다.'
        : v === 0 ? '판단할 것이 남지 않았습니다. 데이터만으로 끝납니다.'
        : '판단을 건별로 분리하면 각각 결정 카드가 됩니다.'),

    {
      key: 'policy_absent',
      label: '적용 가능한 정책 없음',
      status: policy ? 'FAIL' : 'PASS',
      ruleText: '이 판단에 이미 등록된 조직 정책이 없어야 한다.',
      reason: policy
        ? `정책 "${policy.title}" 이 이 상황을 이미 규정하고 있습니다.`
        : '이 상황을 규정한 정책이 없습니다.',
      evidenceIds: policy ? [`ev-policy-${policy.id}`] : [],
      ifResolved: policy ? '정책으로 답할 수 있으므로 사람에게 묻지 않습니다.' : undefined,
    },
  ];
}

function problemGates(f: DerivedFacts): GateCheck[] {
  return [
    gate('symptom_measured', '증상 재현·계측됨', f.alertCount,
      '증상이 알림·지표로 계측되어야 한다.',
      (v) => v > 0,
      () => '장애 알림을 연결하면 이 조건을 확인할 수 있습니다.'),

    gate('data_fresh', '데이터 최신', f.lastUpdatedHours,
      `최종 갱신이 ${f.freshWithinHours}시간 이내여야 한다.`,
      (v) => v <= f.freshWithinHours),

    gate('single_leading_hypothesis', '원인 가설 단일', f.hypothesisGap,
      `1위와 2위 가설의 점수 차가 ${HYPOTHESIS_GAP_THRESHOLD} 이상이어야 한다.`,
      (v) => v >= HYPOTHESIS_GAP_THRESHOLD,
      (v) => v === null
        ? '가설을 정리한 근거가 없습니다. 여기서 AI 는 점수를 지어내지 않습니다.'
        : '여기서 AI 는 하나를 고르지 않습니다. 판단을 사람에게 넘깁니다.'),

    gate('owner_identified', '담당자 확정', f.owner,
      '관련 코드·배포의 소유자를 특정할 수 있어야 한다.',
      () => true,
      () => '소유자를 특정할 수 없으면 원인을 좁힐 수 없습니다.'),

    gate('no_new_decision', '새 결정 없음', f.agendaCounts,
      '원인 확정 외에 새로 내려야 할 결정이 없어야 한다.',
      (v) => v.decision === 0),
  ];
}

/**
 * T4 조율 — 조율 자체는 데이터로 끝나지 않는다. 그래서 DELETE 가 없다.
 * 대신 회의에 남을 이유가 없는 안건(확인·결정)을 빼내 참석자와 안건을 줄인다.
 */
function planningGates(f: DerivedFacts): GateCheck[] {
  return [
    gate('no_new_decision', '새 결정 없음', f.agendaCounts,
      '조율 자리에서 새로 내려야 할 결정이 0건이어야 한다.',
      (v) => v.decision === 0,
      () => '결정 안건은 조율에서 빼내 결정 카드로 올립니다.'),

    gate('no_immediate_discussion', '즉시 토론 불필요', f.agendaCounts,
      '답이 아직 없는 질의형 안건이 0건이어야 한다.',
      (v) => v.question === 0,
      () => '질의 안건을 담당자에게 비동기로 먼저 보내면 조율만 남습니다.'),

    gate('already_delivered', '이미 전달됨', f.undelivered,
      '참석 후보 전원이 배경을 이미 주입받았어야 한다.',
      (v) => v.length === 0,
      (v) => v === null ? '주입 기록이 쌓이면 이 조건을 검사할 수 있습니다.'
        : `${v.join(' · ')} 에게 먼저 흘려보내면 배경 설명 시간이 사라집니다.`),
  ];
}

/** T7 위기 — 판정 대상이 아니다. 늦추지 않고 즉시 연다. */
function crisisGates(): GateCheck[] {
  return [
    ['symptom_measured', '증상 계측'],
    ['data_fresh', '최신성'],
    ['single_leading_hypothesis', '원인 단일'],
    ['owner_identified', '담당자'],
    ['no_new_decision', '결정 필요성'],
  ].map(([key, label]) => ({
    key, label,
    status: 'NOT_APPLICABLE' as const,
    ruleText: '위기에는 조건을 검사하지 않는다.',
    reason: '판정으로 늦출 수 있는 자리가 아닙니다. 즉시 엽니다.',
    evidenceIds: [],
  }));
}

/** T5·T6 은 게이트를 실행하지 않는다. 봐준 게 아니라 애초에 대상이 아니다. */
function skippedGates(type: MeetingType): GateCheck[] {
  const why = type === 'FEEDBACK_1ON1'
    ? '이 유형은 제목과 본문을 읽지 않습니다.'
    : '이 유형은 안건을 분해하지 않습니다.';
  return [
    ['source_of_truth_exists', '근거 확인'],
    ['data_fresh', '최신성'],
    ['no_ambiguity', '모호성'],
    ['no_immediate_discussion', '토론 필요성'],
    ['no_new_decision', '결정 필요성'],
  ].map(([key, label]) => ({
    key, label,
    status: 'NOT_APPLICABLE' as const,
    ruleText: '이 유형에는 적용하지 않는다.',
    reason: why,
    evidenceIds: [],
  }));
}

// ── outcome ───────────────────────────────────────────────────────

function outcomeFor(type: MeetingType, gates: GateCheck[]): Outcome {
  const st = (key: string) => gates.find((g) => g.key === key)?.status;
  const hasUnknown = gates.some((g) => g.status === 'UNKNOWN');
  const allPass = gates.every((g) => g.status === 'PASS' || g.status === 'NOT_APPLICABLE');

  if (type === 'BRAINSTORMING' || type === 'FEEDBACK_1ON1' || type === 'CONFLICT_CRISIS') return 'MEET';

  if (type === 'PLANNING') {
    // 조율은 동시 대화가 본질이라 없앨 수 없다. 줄일 뿐이다.
    if (st('no_new_decision') === 'FAIL') return 'DECIDE';
    return 'SHRINK';
  }

  // 근거가 없으면 없앨 수 없다. 이건 성능이 아니라 안전 규칙이다.
  if (hasUnknown && type !== 'PROBLEM_SOLVING') return 'ASYNC';

  if (type === 'STATUS') {
    if (st('no_new_decision') === 'FAIL') return 'DECIDE';
    if (st('no_immediate_discussion') === 'FAIL') return 'SHRINK';
    if (allPass) return 'DELETE';
    return 'ASYNC';
  }

  if (type === 'DECISION') {
    if (st('prerequisites_complete') === 'FAIL') return 'ASYNC';
    if (st('policy_absent') === 'FAIL') return 'ASYNC';
    if (st('single_value_judgment') === 'FAIL') {
      const g = gates.find((x) => x.key === 'single_value_judgment');
      return g?.reason.startsWith('정책으로 답할 수 없는 결정 안건 0건') ? 'DELETE' : 'SHRINK';
    }
    if (allPass) return 'DECIDE';
    return 'ASYNC';
  }

  if (type === 'PROBLEM_SOLVING') {
    if (st('single_leading_hypothesis') !== 'PASS') return 'SHRINK';
    if (st('symptom_measured') !== 'PASS') return 'SHRINK';
    if (st('no_new_decision') === 'FAIL') return 'DECIDE';
    return 'ASYNC';
  }

  return 'ASYNC';
}

// ── 결정 수신자 ───────────────────────────────────────────────────
/**
 * "왜 제가 받았나요" 에 답할 수 있어야 결정 카드다.
 * 그래서 수신자는 상수가 아니라 규칙으로 뽑고, 규칙 문장을 함께 싣는다.
 */
function pickDecider(
  req: MeetingRequest, evidence: Evidence[], f: DerivedFacts, stats: ResponseStats,
): Decider {
  const withStats = (member: string, rule: string, evidenceIds: string[]): Decider => ({
    member, rule, evidenceIds,
    typicalResponseHours: stats[member]?.medianHours ?? null,
    responseSampleCount: stats[member]?.count ?? 0,
  });

  if (f.owner.value) {
    return withStats(f.owner.value, '결정 안건에 걸린 작업의 소유자입니다.', f.owner.evidenceIds);
  }
  const decisionAgenda = req.agenda.filter((a) => a.kind === 'DECISION');
  const linked = evidence.find((e) => decisionAgenda.some((a) => a.evidenceIds.includes(e.id)));
  if (linked?.facts?.owner) {
    return withStats(linked.facts.owner, '이 결정의 근거를 만든 작업의 소유자입니다.', [linked.id]);
  }
  return withStats(req.requestedBy, '소유자를 특정할 근거가 없어 요청자에게 되돌립니다.', []);
}

/** 원장에서 센 값. 사람마다 결정에 답하기까지 실제로 걸린 시간이다. */
export type ResponseStats = Record<string, { medianHours: number; count: number }>;

// ── 참석자 ────────────────────────────────────────────────────────
/**
 * 참석 후보 중 근거에 실제로 등장하는 사람만 남긴다.
 * 관련도를 점수로 추정하지 않는다 — 기록에 있거나 없거나다.
 */
function pickAttendees(req: MeetingRequest, evidence: Evidence[]): Attendee[] {
  const owners = new Set(
    evidence.map((e) => e.facts?.owner).filter((o): o is string => !!o),
  );
  const delivered = new Set(evidence.flatMap((e) => e.facts?.deliveredTo ?? []));

  return req.attendeeCandidates.map((name) => {
    if (owners.has(name)) {
      return { key: name, name, included: true, reason: '이 안건의 작업 소유자입니다.' };
    }
    if (delivered.has(name)) {
      return { key: name, name, included: false, reason: '이미 내용을 주입받았습니다. 앉아 있을 이유가 없습니다.' };
    }
    return { key: name, name, included: false, reason: '근거에 등장하지 않습니다.' };
  });
}

// ── 산출물 ────────────────────────────────────────────────────────

function buildArtifact(
  outcome: Outcome, req: MeetingRequest, gates: GateCheck[], evidence: Evidence[],
  f: DerivedFacts, policy: Policy | null, stats: ResponseStats,
): Artifact {
  const failing = gates.filter((g) => g.status === 'FAIL');
  const unknown = gates.filter((g) => g.status === 'UNKNOWN');
  const applicable = gates.filter((g) => g.status !== 'NOT_APPLICABLE').length;
  const passed = gates.filter((g) => g.status === 'PASS').length;

  if (outcome === 'DELETE' || outcome === 'ASYNC') {
    return {
      type: 'RESOLUTION_LOG',
      content: {
        summary: policy
          ? `이 안건은 정책 "${policy.title}" 으로 판정했습니다. 사람에게 다시 묻지 않았습니다.`
          : unknown.length > 0
            ? `조건 ${passed}/${applicable} 충족 · ${unknown.length}건은 근거가 없어 확인하지 못했습니다. `
              + '확인하지 못한 조건이 있으므로 삭제하지 않고 비동기로 종료합니다.'
            : failing.length === 0
              ? '조건을 전부 충족해 회의 없이 종료했습니다.'
              : `조건 ${passed}/${applicable} 충족 — 남은 항목은 모여서 풀 것이 아니라 데이터를 고치면 사라집니다.`,
        resolvedByData: [
          ...gates.filter((g) => g.status === 'PASS').map((g) => `${g.label} — ${g.reason}`),
          ...((f.alreadyAnswered.value?.length ?? 0) > 0 ? [f.alreadyAnswered.note] : []),
        ],
        resolvedByPolicy: policy ? [`${policy.title} — ${policy.rule}`] : [],
        askedPeople: req.attendeeCandidates.length,
        askedMinutes: req.plannedMinutes,
        followUpCondition: unknown.length > 0
          ? '없는 근거가 채워지면 확인하지 못한 조건을 다시 검사합니다.'
          : failing[0]?.ifResolved ?? '근거가 바뀌면 다시 판정합니다.',
      },
    };
  }

  if (outcome === 'DECIDE') {
    const decider = pickDecider(req, evidence, f, stats);
    const decisionAgenda = req.agenda.filter((a) => a.kind === 'DECISION');
    const question = decisionAgenda[0]?.title ?? `"${req.title}" 에 남은 결정 1건을 확정해 주세요.`;
    const linkedEvidence = decisionAgenda.flatMap((a) => a.evidenceIds);

    // 선택지를 지어내지 않는다. 근거가 실제로 가리키는 두 갈래만 세운다.
    const p1 = f.openP1.value ?? 0;
    const options: DecisionOption[] = p1 > 0
      ? [
          { key: 'proceed', label: '그대로 진행', pros: ['일정 유지'],
            cons: [`P1 결함 ${p1}건을 안고 나갑니다`], evidenceIds: f.openP1.evidenceIds },
          { key: 'hold', label: '보완 후 진행', pros: [`P1 결함 ${p1}건 해소`],
            cons: ['일정 지연'], evidenceIds: f.openP1.evidenceIds },
        ]
      : [
          { key: 'proceed', label: '진행', pros: ['일정 유지'], cons: [], evidenceIds: linkedEvidence },
          { key: 'hold', label: '보류', pros: [], cons: ['일정 지연'], evidenceIds: linkedEvidence },
        ];

    return {
      type: 'DECISION_CARD',
      content: {
        question,
        whyYou: decider.rule,
        decider,
        // 마감은 회의 예정 시각이다. 그 전에 답이 나오면 회의가 필요 없다.
        dueAt: req.scheduledAt,
        options,
        recommendedKey: null,
        prerequisites: gates.filter((g) => g.status === 'PASS').map((g) => g.label),
      },
    };
  }

  // SHRINK · MEET
  const attendees = pickAttendees(req, evidence);
  const keep = req.agenda.filter((a) => a.kind !== 'INFO');
  const split = req.agenda.filter((a) => a.kind === 'INFO');

  return {
    type: 'MEETING_PRESCRIPTION',
    content: {
      purpose: failing[0]?.label
        ? `${failing[0].label} — 동시 대화가 필요한 조건입니다.`
        : '동시 대화가 필요한 조건이 남았습니다.',
      reason: failing[0]?.reason ?? unknown[0]?.reason ?? '조건을 확인하지 못했습니다.',
      attendees,
      askedAttendees: req.attendeeCandidates,
      askedMinutes: req.plannedMinutes,
      agendas: keep.map((a) => ({ title: a.title, kind: a.kind, evidenceIds: a.evidenceIds })),
      splitOff: split.map((a) => ({ title: a.title, reason: '확인하면 끝나는 안건입니다. 모이지 않고 처리합니다.' })),
      preReads: gates.filter((g) => g.status === 'PASS').map((g) => `${g.label} — ${g.reason}`),
      exitCriteria: failing.map((g) => g.ifResolved ?? `${g.label} 해소`),
    },
  };
}

// ── 판정 실행 ─────────────────────────────────────────────────────

export function evaluate(opts: {
  request: MeetingRequest;
  /** 커넥터가 준 근거 전부. 끊긴 소스의 근거는 여기 들어오지 않는다. */
  evidence: Evidence[];
  /** 근거를 공급했어야 하나 연결이 끊겨 빠진 소스 */
  droppedSources: ConnectorId[];
  activePolicies: Policy[];
  /** 원장에서 센 사람별 응답 시간. 없으면 빈 객체. */
  responseStats?: ResponseStats;
  now: number;
  id: string;
}): Evaluation {
  const { request: req, evidence, droppedSources, activePolicies, now, id } = opts;
  const responseStats = opts.responseStats ?? {};

  // 1) 유형 — 명시 표식이 있으면 분류기를 부르지 않는다.
  let type: MeetingType;
  let clarification: string | null = null;
  const sorted = [...req.typeCandidates].sort((a, b) => b.score - a.score);
  const gap = sorted.length > 1 ? sorted[0].score - sorted[1].score : 1;

  if (req.explicitTypeMarker) {
    type = req.explicitTypeMarker;
  } else if (sorted.length === 0 || gap < TYPE_GAP_THRESHOLD) {
    type = 'UNCLASSIFIED';
    clarification = '이 회의에서 무엇을 만들려고 하시나요? 목적을 한 줄로 알려주세요.';
  } else {
    type = sorted[0].type;
  }

  const policy = activePolicies.find(
    (p) => p.status === 'ACTIVE' && req.patternKey && p.patternKey === req.patternKey,
  ) ?? null;

  // 2) 파생 — 게이트가 읽을 값을 근거에서 계산한다.
  const facts = deriveFacts({
    evidence,
    agenda: req.agenda,
    attendeeCandidates: req.attendeeCandidates,
    meetingType: type,
    activePolicies,
    patternKey: req.patternKey,
    now,
  });

  // 3) 게이트
  const skipped = type === 'BRAINSTORMING' || type === 'FEEDBACK_1ON1';
  let gates: GateCheck[] = [];
  if (type === 'UNCLASSIFIED') gates = [];
  else if (skipped) gates = skippedGates(type);
  else if (type === 'STATUS') gates = statusGates(facts);
  else if (type === 'DECISION') gates = decisionGates(facts, policy);
  else if (type === 'PROBLEM_SOLVING') gates = problemGates(facts);
  else if (type === 'PLANNING') gates = planningGates(facts);
  else if (type === 'CONFLICT_CRISIS') gates = crisisGates();
  else gates = skippedGates(type);

  // 4) 결과 — 유형이 미분류면 결론을 내지 않는다
  const outcome = type === 'UNCLASSIFIED' ? null : outcomeFor(type, gates);

  const withPolicy: Evidence[] = policy
    ? [...evidence, {
        id: `ev-policy-${policy.id}`, source: 'POLICY', sourceRef: `policy:${policy.id}`,
        kind: 'POLICY_RULE', summary: `${policy.title} — ${policy.rule}`,
        observedAt: policy.activatedAt ?? new Date(now).toISOString(),
      }]
    : evidence;

  const artifact = outcome
    ? buildArtifact(outcome, req, gates, withPolicy, facts, policy, responseStats)
    : null;

  return {
    id,
    requestId: req.id,
    title: req.title,
    scheduledAt: req.scheduledAt,
    requestedAt: new Date(now).toISOString(),
    meetingType: type,
    typeCandidates: sorted,
    typeRationale: req.typeRationale,
    clarificationQuestion: clarification,
    evidence: withPolicy,
    droppedSources,
    gateChecks: gates,
    outcome,
    artifact,
    ruleVersion: RULE_VERSION,
    decisionStatus: artifact?.type === 'DECISION_CARD' ? 'PENDING' : undefined,
    selectedOptionKey: null,
    revertReason: null,
    patternKey: req.patternKey,
  };
}

/** 처방전이 실제로 줄인 것. 계산식을 화면에 그대로 보여준다. */
export function shrinkMath(c: { attendees: Attendee[]; askedAttendees: string[] }) {
  return {
    before: c.askedAttendees.length,
    after: c.attendees.filter((a) => a.included).length,
  };
}
