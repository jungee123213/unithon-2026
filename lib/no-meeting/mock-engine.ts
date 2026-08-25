import { RULE_VERSION, type Authored } from './mock-data';
import type {
  Artifact, ConnectorId, Evaluation, Evidence, GateCheck, MeetingType, Outcome, Policy, Scenario,
} from './types';

/**
 * 목 판정 엔진 — 화면을 위한 결정적 규칙.
 *
 * 이건 백엔드가 아니다. 하지만 "값을 바꾸면 결론이 바뀐다" 를 보여주지 못하면
 * 이 제품의 주장 자체를 시연할 수 없기 때문에, 게이트 계산만은 진짜로 한다.
 *
 * 지키는 경계는 실제 설계와 같다.
 *   - 게이트는 구조화된 값과 비교 연산으로만 계산한다. 추정하지 않는다.
 *   - 근거가 없으면 UNKNOWN 이고, UNKNOWN 이 있으면 DELETE 하지 않는다.
 *   - 커넥터가 끊겨 있으면 그 소스의 근거는 아예 스냅샷에 들어오지 않는다.
 *   - 유형만으로 경로가 정해지는 T5·T6·T8 은 조건을 검사하지 않는다.
 */

const N = (v: unknown, d = 0) => (typeof v === 'number' ? v : d);
const B = (v: unknown, d = false) => (typeof v === 'boolean' ? v : d);

/** 분류기가 스스로 손을 드는 지점. 1·2위 차가 이보다 작으면 확정하지 않는다. */
export const TYPE_GAP_THRESHOLD = 0.2;
/** 원인 가설이 이보다 가까우면 사람에게 넘긴다. */
export const HYPOTHESIS_GAP_THRESHOLD = 0.2;

type Live = Record<string, number | boolean>;

// ── 유형별 게이트 ─────────────────────────────────────────────────

/**
 * 소스 두 종류를 구분한다.
 *   anySource      — 상태를 확인할 수 있는 곳이 하나라도 있는가 (Jira 또는 TeamSync)
 *   structuredState— Task 단위로 계산 가능한 상태가 있는가 (Jira 만 해당)
 *
 * TeamSync 요약은 "무엇을 했는가" 이지 "24건 중 24건 완료" 가 아니다.
 * 그래서 최신성·모호성처럼 세는 조건은 이슈트래커 없이는 확인할 수 없다.
 */
function statusGates(
  live: Live, evidenceIds: string[],
  src: { anySource: boolean; structuredState: boolean },
): GateCheck[] {
  const sot = src.anySource && B(live.sourceOfTruthExists, true);
  const updated = N(live.lastUpdatedHours);
  const limit = N(live.freshWithinHours, 3);
  const ambiguous = N(live.ambiguousStatusCount);
  const questions = N(live.questionAgendaCount);
  const decisions = N(live.decisionAgendaCount);

  // 셀 수 있는 상태가 없으면 실패가 아니라 "알 수 없음" 이다.
  // 이 구분이 없으면 근거 없는 삭제가 생긴다.
  const blind = !sot || !src.structuredState;

  return [
    {
      key: 'source_of_truth_exists',
      label: 'Source of Truth 존재',
      status: sot ? 'PASS' : 'FAIL',
      ruleText: '안건의 상태를 확인할 수 있는 시스템이 연결되어 있어야 한다.',
      reason: !src.anySource
        ? '상태를 확인할 수 있는 소스가 하나도 연결되어 있지 않습니다.'
        : src.structuredState
          ? '이슈트래커와 TeamSync 가 연결되어 있습니다.'
          : 'TeamSync 만 연결되어 있습니다. 작업 요약은 있지만 Task 단위 상태는 없습니다.',
      evidenceIds: evidenceIds.slice(0, 2),
      ifResolved: sot ? undefined : '연결 화면에서 이슈트래커를 연결하면 나머지 조건을 검사할 수 있습니다.',
    },
    {
      key: 'data_fresh',
      label: '데이터 최신',
      status: blind ? 'UNKNOWN' : updated <= limit ? 'PASS' : 'FAIL',
      ruleText: `최종 갱신이 ${limit}시간 이내여야 한다.`,
      reason: blind
        ? '이슈트래커가 없어 갱신 시각을 셀 수 없습니다.'
        : `최종 갱신 ${updated}시간 전 · 기준 ${limit}시간.`,
      evidenceIds: evidenceIds.slice(0, 1),
      ifResolved: blind
        ? '이슈트래커를 연결하면 이 조건을 확인할 수 있습니다.'
        : updated > limit
        ? `갱신 주기를 ${Math.max(1, Math.ceil(updated / 24))}일 → 1일로 줄이면 이 조건이 해소됩니다.`
        : undefined,
    },
    {
      key: 'no_ambiguity',
      label: '해석 모호성 없음',
      status: blind ? 'UNKNOWN' : ambiguous === 0 ? 'PASS' : 'FAIL',
      ruleText: '상태 값이 한 가지로만 읽혀야 한다.',
      reason: blind
        ? '이슈트래커가 없어 상태 표기를 Task 단위로 대조할 수 없습니다.'
        : ambiguous === 0
          ? '모든 상태가 Task 단위로 계산되어 있습니다.'
          : `${ambiguous}건 — "진행률 80%" 가 핵심 기능 완료를 뜻하는지 불명확합니다.`,
      evidenceIds: evidenceIds.slice(0, 2),
      ifResolved: blind
        ? '이슈트래커를 연결하면 이 조건을 확인할 수 있습니다.'
        : ambiguous > 0
          ? '진행률 표기를 Task 단위(완료/전체)로 바꾸면 이 조건이 해소됩니다.'
          : undefined,
    },
    {
      key: 'no_immediate_discussion',
      label: '즉시 토론 불필요',
      status: questions === 0 ? 'PASS' : 'FAIL',
      ruleText: '답이 아직 없는 질의형 안건이 0건이어야 한다.',
      reason: questions === 0 ? '질의형 안건 0건.' : `질의형 안건 ${questions}건.`,
      evidenceIds: [],
      ifResolved: questions > 0 ? '질의 안건을 담당자에게 비동기로 먼저 보내면 해소됩니다.' : undefined,
    },
    {
      key: 'no_new_decision',
      label: '새 결정 없음',
      status: decisions === 0 ? 'PASS' : 'FAIL',
      ruleText: '새로 내려야 할 결정이 0건이어야 한다.',
      reason: decisions === 0 ? '결정 안건 0건.' : `결정 안건 ${decisions}건 — 사람의 판단이 필요합니다.`,
      evidenceIds: [],
      ifResolved: decisions > 0 ? '이 건은 회의가 아니라 결정 카드로 처리됩니다.' : undefined,
    },
  ];
}

function decisionGates(
  live: Live, evidenceIds: string[], policy: Policy | null, hasTracker: boolean,
): GateCheck[] {
  const qaDone = N(live.qaCompleted, 12);
  const qaTotal = 12;
  const updated = N(live.lastUpdatedHours);
  const limit = N(live.freshWithinHours, 12);
  const judgments = N(live.openValueJudgments, 1);
  const options = N(live.optionCount, 2);

  return [
    {
      key: 'prerequisites_complete',
      label: 'Prerequisite 충족',
      status: !hasTracker ? 'UNKNOWN' : qaDone >= qaTotal ? 'PASS' : 'FAIL',
      ruleText: '다음 단계 진행에 필요한 선행 조건이 전부 완료여야 한다.',
      reason: hasTracker
        ? `QA 체크리스트 ${qaDone}/${qaTotal} 완료.`
        : '이슈트래커가 연결되어 있지 않아 체크리스트를 읽을 수 없습니다.',
      evidenceIds: evidenceIds.slice(0, 2),
      ifResolved: !hasTracker
        ? '연결 화면에서 이슈트래커를 연결하세요.'
        : qaDone < qaTotal
          ? `NO-GO 사유입니다. 남은 ${qaTotal - qaDone}건이 끝나면 다시 판정합니다.`
          : undefined,
    },
    {
      key: 'data_fresh',
      label: '데이터 최신',
      status: updated <= limit ? 'PASS' : 'FAIL',
      ruleText: `최종 갱신이 ${limit}시간 이내여야 한다.`,
      reason: `최종 갱신 ${updated}시간 전 · 기준 ${limit}시간.`,
      evidenceIds: evidenceIds.slice(3, 4),
      ifResolved: updated > limit ? '상태를 갱신하고 다시 판정하세요.' : undefined,
    },
    {
      key: 'options_defined',
      label: '선택지 정의됨',
      status: options >= 2 ? 'PASS' : 'FAIL',
      ruleText: '비교 가능한 선택지가 2개 이상이어야 한다.',
      reason: `정의된 선택지 ${options}개.`,
      evidenceIds: [],
      ifResolved: options < 2 ? '선택지를 만들려면 동시 대화가 필요합니다. 축소 회의로 전환됩니다.' : undefined,
    },
    {
      key: 'single_value_judgment',
      label: '남은 가치판단 1건',
      status: judgments === 1 ? 'PASS' : 'FAIL',
      ruleText: '조건 판정을 걷어내고 남은 가치판단이 정확히 1건이어야 한다.',
      reason: judgments === 0
        ? '남은 가치판단이 없습니다. 데이터만으로 끝납니다.'
        : judgments === 1
          ? '캠페인 일정과 결제 품질 중 무엇을 우선할지 — 1건.'
          : `${judgments}건 — 한 번에 하나씩 나눠야 합니다.`,
      evidenceIds: evidenceIds.slice(2, 3),
      ifResolved: judgments > 1 ? '판단을 건별로 분리하면 각각 결정 카드가 됩니다.' : undefined,
    },
    {
      key: 'policy_absent',
      label: '적용 가능한 정책 없음',
      status: policy ? 'FAIL' : 'PASS',
      ruleText: '이 판단에 이미 등록된 조직 정책이 없어야 한다.',
      reason: policy
        ? `정책 "${policy.title}" 이 이 상황을 이미 규정하고 있습니다.`
        : '이 상황을 규정한 정책이 없습니다.',
      evidenceIds: [],
      ifResolved: policy ? '정책으로 답할 수 있으므로 사람에게 묻지 않습니다.' : undefined,
    },
  ];
}

/**
 * 문제 해결 회의의 근거는 사람 말이 아니라 알림이다.
 * 장애 알림이 연결돼 있지 않으면 "증상이 실제로 일어났는가" 부터 확인할 수 없다.
 */
function problemGates(live: Live, evidenceIds: string[], hasAlerts: boolean): GateCheck[] {
  const top = N(live.hypothesisTop, 0.4);
  const second = N(live.hypothesisSecond, 0.35);
  const gap = Math.round((top - second) * 100) / 100;
  const reproducible = B(live.symptomReproducible, true);
  const owner = B(live.ownerIdentified, true);
  const updated = N(live.lastUpdatedHours);
  const limit = N(live.freshWithinHours, 6);
  const decisions = N(live.decisionAgendaCount);

  return [
    {
      key: 'symptom_reproducible',
      label: '증상 재현·계측됨',
      status: hasAlerts && reproducible ? 'PASS' : 'UNKNOWN',
      ruleText: '증상이 알림·지표로 계측되어야 한다.',
      reason: !hasAlerts
        ? '장애 알림이 연결되어 있지 않아 5xx 발생 여부를 확인할 수 없습니다.'
        : reproducible
          ? '결제 API 5xx 급증이 알림으로 계측되었습니다 (0.4% → 3.1%).'
          : '증상이 계측되지 않아 확인할 수 없습니다.',
      evidenceIds: evidenceIds.slice(0, 1),
      ifResolved: !hasAlerts
        ? '장애 알림을 연결하면 이 조건을 확인할 수 있습니다.'
        : reproducible ? undefined : '재현 경로를 확보하기 전에는 원인을 좁힐 수 없습니다.',
    },
    {
      key: 'data_fresh',
      label: '데이터 최신',
      status: updated <= limit ? 'PASS' : 'FAIL',
      ruleText: `최종 갱신이 ${limit}시간 이내여야 한다.`,
      reason: `최종 갱신 ${updated}시간 전 · 기준 ${limit}시간.`,
      evidenceIds: evidenceIds.slice(0, 1),
    },
    {
      key: 'single_leading_hypothesis',
      label: '원인 가설 단일',
      status: gap >= HYPOTHESIS_GAP_THRESHOLD ? 'PASS' : 'FAIL',
      ruleText: `1위와 2위 가설의 점수 차가 ${HYPOTHESIS_GAP_THRESHOLD} 이상이어야 한다.`,
      reason: `1위 ${top.toFixed(2)} · 2위 ${second.toFixed(2)} · 차이 ${gap.toFixed(2)}.`,
      evidenceIds: evidenceIds.slice(2, 3),
      ifResolved: gap < HYPOTHESIS_GAP_THRESHOLD
        ? '여기서 AI 는 하나를 고르지 않습니다. 판단을 사람에게 넘깁니다.'
        : undefined,
    },
    {
      key: 'owner_identified',
      label: '담당자 확정',
      status: owner ? 'PASS' : 'UNKNOWN',
      ruleText: '관련 코드·배포의 소유자를 특정할 수 있어야 한다.',
      reason: owner ? '배포 수행자와 모듈 소유자가 특정되었습니다.' : '소유자를 특정할 수 없습니다.',
      evidenceIds: evidenceIds.slice(1, 2),
    },
    {
      key: 'no_new_decision',
      label: '새 결정 없음',
      status: decisions === 0 ? 'PASS' : 'FAIL',
      ruleText: '원인 확정 외에 새로 내려야 할 결정이 없어야 한다.',
      reason: decisions === 0 ? '결정 안건 0건.' : `결정 안건 ${decisions}건.`,
      evidenceIds: [],
    },
  ];
}

/** T5·T6 은 게이트를 실행하지 않는다. 봐준 게 아니라 애초에 대상이 아니다. */
function skippedGates(type: MeetingType): GateCheck[] {
  const why = type === 'FEEDBACK_1ON1'
    ? '이 유형은 제목과 본문을 읽지 않습니다.'
    : '이 유형은 안건을 분해하지 않습니다.';
  return ['source_of_truth_exists', 'data_fresh', 'no_ambiguity', 'no_immediate_discussion', 'no_new_decision']
    .map((key, i) => ({
      key, label: ['근거 확인', '최신성', '모호성', '토론 필요성', '결정 필요성'][i],
      status: 'NOT_APPLICABLE' as const,
      ruleText: '이 유형에는 적용하지 않는다.',
      reason: why, evidenceIds: [],
    }));
}

// ── outcome ──────────────────────────────────────────────────

function outcomeFor(type: MeetingType, gates: GateCheck[]): Outcome {
  const st = (key: string) => gates.find((g) => g.key === key)?.status;
  const hasUnknown = gates.some((g) => g.status === 'UNKNOWN');
  const allPass = gates.every((g) => g.status === 'PASS' || g.status === 'NOT_APPLICABLE');

  if (type === 'BRAINSTORMING' || type === 'FEEDBACK_1ON1') return 'MEET';
  if (type === 'CONFLICT_CRISIS') return 'MEET';

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
      return gates.find((g) => g.key === 'single_value_judgment')?.reason.startsWith('남은 가치판단이 없습니다')
        ? 'DELETE' : 'SHRINK';
    }
    if (st('options_defined') === 'FAIL') return 'SHRINK';
    if (allPass) return 'DECIDE';
    return 'ASYNC';
  }

  if (type === 'PROBLEM_SOLVING') {
    if (st('single_leading_hypothesis') === 'FAIL') return 'SHRINK';
    if (st('symptom_reproducible') !== 'PASS') return 'SHRINK';
    if (st('no_new_decision') === 'FAIL') return 'DECIDE';
    if (hasUnknown) return 'ASYNC';
    if (allPass) return 'ASYNC';
    return 'ASYNC';
  }

  // T4·T7 은 아직 규칙이 없다. 시나리오도 없으므로 여기에 도달하지 않는다.
  return 'ASYNC';
}

// ── 산출물 ────────────────────────────────────────────────────────

function buildArtifact(
  outcome: Outcome, sc: Scenario, gates: GateCheck[],
  authored: Authored | undefined, policy: Policy | null, now: number,
): Artifact {
  const failing = gates.filter((g) => g.status === 'FAIL');
  // UNKNOWN 은 실패가 아니지만 "전부 충족" 도 아니다. 둘을 섞으면 산출물이 거짓말을 한다.
  const unknown = gates.filter((g) => g.status === 'UNKNOWN');
  const applicable = gates.filter((g) => g.status !== 'NOT_APPLICABLE').length;
  const passed = gates.filter((g) => g.status === 'PASS').length;

  if (outcome === 'DELETE' || outcome === 'ASYNC') {
    const a = authored?.resolution;
    // 해결 로그는 게이트 결과만으로도 전부 채워진다. 사람이 미리 쓴 문안이 없다고
    // 해서 "확인 필요" 가 생기지는 않으므로 FALLBACK 으로 내리지 않는다.
    const resolvedByData = a?.resolvedByData ?? gates
      .filter((g) => g.status === 'PASS')
      .map((g) => `${g.label} — ${g.reason}`);
    const resolvedByPolicy = a?.resolvedByPolicy ?? (policy ? [`${policy.title} — ${policy.rule}`] : []);
    return {
      type: 'RESOLUTION_LOG',
      content: {
        summary: a?.summary
          ?? (policy
            ? `이 안건은 정책 "${policy.title}" 으로 판정했습니다. 사람에게 다시 묻지 않았습니다.`
            : unknown.length > 0
              ? `조건 ${passed}/${applicable} 충족 · ${unknown.length}건은 소스가 연결되어 있지 않아 확인하지 못했습니다. `
                + '확인하지 못한 조건이 있으므로 삭제하지 않고 비동기로 종료합니다.'
              : failing.length === 0
                ? '조건을 전부 충족해 회의 없이 종료했습니다.'
                : `조건 ${passed}/${applicable} 충족 — 남은 항목은 모여서 풀 것이 아니라 데이터를 고치면 사라집니다.`),
        resolvedByData,
        resolvedByPolicy,
        savedPeople: sc.attendeeCount,
        savedMinutes: sc.plannedMinutes,
        followUpCondition: a?.followUpCondition
          ?? (unknown.length > 0
            ? '끊긴 소스를 연결하면 확인하지 못한 조건을 다시 검사합니다.'
            : failing[0]?.ifResolved ?? '입력 데이터가 바뀌면 다시 판정합니다.'),
      },
    };
  }

  if (outcome === 'DECIDE') {
    const d = authored?.decision;
    if (d) return { type: 'DECISION_CARD', content: d };
    // 근거가 없는 선택지를 AI 가 지어내지 않는다. 템플릿으로 내려앉는다.
    return {
      type: 'DECISION_CARD',
      content: {
        question: `"${sc.title}" 에 남은 결정 1건을 확정해 주세요.`,
        whyYou: '조건 판정은 끝났습니다. 남은 것은 기준 문서에 없는 판단이라 사람에게 올라왔습니다.',
        deciderRole: '릴리즈 매니저',
        dueAt: new Date(now + 4 * 3_600_000).toISOString(),
        options: [
          { key: 'proceed', label: '진행', pros: ['일정 유지'], cons: ['확인 필요'], evidenceIds: [] },
          { key: 'hold', label: '보류', pros: ['위험 회피'], cons: ['일정 지연'], evidenceIds: [] },
        ],
        recommendedKey: null,
        recommendationScore: null,
        prerequisites: gates.filter((g) => g.status === 'PASS').map((g) => g.label),
      },
    };
  }

  // SHRINK · MEET
  const p = authored?.prescription;
  return {
    type: 'MEETING_PRESCRIPTION',
    content: {
      purpose: p?.purpose ?? '확인 필요',
      reason: p?.reason ?? failing[0]?.reason ?? '동시 대화가 필요한 조건이 남았습니다.',
      // 참석자·안건은 입력에 있는 것만 쓴다. 없으면 만들어내지 않고 비워 둔다.
      attendees: p?.attendees ?? [],
      originalAttendeeCount: sc.attendeeCount,
      originalMinutes: sc.plannedMinutes,
      agendas: p?.agendas ?? [],
      splitOff: p?.splitOff ?? [],
      preReads: p?.preReads ?? [],
      exitCriteria: p?.exitCriteria ?? ['확인 필요 — 종료 조건을 만들 근거가 부족합니다.'],
    },
  };
}

// ── 판정 실행 ─────────────────────────────────────────────────────

export function evaluate(opts: {
  scenario: Scenario;
  liveData: Record<string, number | boolean>;
  authored: Authored | undefined;
  activePolicies: Policy[];
  /** 지금 연결돼 있는 소스. 끊긴 소스의 근거는 애초에 스냅샷에 들어오지 않는다. */
  connected: Set<ConnectorId>;
  now: number;
  id: string;
}): Evaluation {
  const { scenario: sc, liveData, authored, activePolicies, connected, now, id } = opts;

  const available = sc.evidence.filter((e) => e.source === 'POLICY' || connected.has(e.source));
  const droppedSources: ConnectorId[] = [...new Set(
    sc.evidence
      .map((e) => e.source)
      .filter((src): src is ConnectorId => src !== 'POLICY' && !connected.has(src)),
  )];
  const evidenceIds = available.map((e) => e.id);
  // QA 체크리스트·Task 카운트는 이슈트래커에만 있다.
  const structuredState = connected.has('jira');
  const anySource = structuredState || connected.has('teamsync');
  const hasAlerts = connected.has('alerts');

  // 1) 유형 — 명시 표식이 있으면 LLM 을 부르지 않는다.
  let type: MeetingType;
  let clarification: string | null = null;
  const sorted = [...sc.typeCandidates].sort((a, b) => b.score - a.score);
  const gap = sorted.length > 1 ? sorted[0].score - sorted[1].score : 1;

  if (sc.explicitTypeMarker) {
    type = sc.explicitTypeMarker;
  } else if (gap < TYPE_GAP_THRESHOLD) {
    type = 'UNCLASSIFIED';
    clarification = '이 회의에서 무엇을 만들려고 하시나요? 목적을 한 줄로 알려주세요.';
  } else {
    type = sorted[0].type;
  }

  // 2) 게이트
  const skipped = type === 'BRAINSTORMING' || type === 'FEEDBACK_1ON1';
  const policy = activePolicies.find(
    (p) => p.status === 'ACTIVE' && sc.patternKey && p.patternKey === sc.patternKey,
  ) ?? null;

  let gates: GateCheck[] = [];
  if (type === 'UNCLASSIFIED') gates = [];
  else if (skipped) gates = skippedGates(type);
  else if (type === 'STATUS') gates = statusGates(liveData, evidenceIds, { anySource, structuredState });
  else if (type === 'DECISION') gates = decisionGates(liveData, evidenceIds, policy, structuredState);
  else if (type === 'PROBLEM_SOLVING') gates = problemGates(liveData, evidenceIds, hasAlerts);
  else gates = skippedGates(type);

  // 3) 결과 — 유형이 미분류면 결론을 내지 않는다
  const outcome = type === 'UNCLASSIFIED' ? null : outcomeFor(type, gates);

  // 4) 산출물
  // 읽지 못한 소스가 있으면 사람이 미리 써 둔 문안을 쓰지 않는다.
  // 그 문안은 모든 소스가 붙어 있다는 전제로 쓰였고, 지금은 확인할 수 없는
  // 사실("jira:PAY-118 24/24 완료")을 산출물이 단언하게 되기 때문이다.
  const artifact = outcome
    ? buildArtifact(outcome, sc, gates, droppedSources.length > 0 ? undefined : authored, policy, now)
    : null;

  const evidence: Evidence[] = policy
    ? [...available, {
        id: `ev-policy-${policy.id}`, source: 'POLICY', sourceRef: `policy:${policy.id}`,
        kind: 'POLICY_RULE', summary: `${policy.title} — ${policy.rule}`,
        observedAt: policy.activatedAt ?? new Date(now).toISOString(),
      }]
    : available;

  return {
    id, scenarioId: sc.id,
    title: sc.title,
    scheduledAt: sc.scheduledAt,
    requestedAt: new Date(now).toISOString(),
    meetingType: type,
    typeCandidates: sorted,
    typeRationale: sc.typeRationale,
    clarificationQuestion: clarification,
    evidence,
    droppedSources,
    gateChecks: gates,
    outcome,
    artifact,
    ruleVersion: RULE_VERSION,
    liveData: { ...liveData },
    decisionStatus: artifact?.type === 'DECISION_CARD' ? 'PENDING' : undefined,
    selectedOptionKey: null,
    revertReason: null,
    patternKey: sc.patternKey,
  };
}

/** 처방전의 인시 — 참석자 × 안건 시간 합. 화면에서 계산식을 그대로 보여준다. */
export function personMinutes(c: { attendees: { included: boolean }[]; agendas: { minutes: number }[] }) {
  const people = c.attendees.filter((a) => a.included).length;
  const minutes = c.agendas.reduce((s, a) => s + a.minutes, 0);
  return { people, minutes, total: people * minutes };
}
