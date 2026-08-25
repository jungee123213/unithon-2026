import type {
  AgendaItem, Evidence, MeetingType, Policy,
} from './types';
import { FRESH_WITHIN_HOURS } from './settings';

/**
 * 파생 계층 — 근거에서 게이트 입력값을 계산한다.
 *
 * 이 파일이 있기 전에는 게이트가 슬라이더 값을 읽었고, 옆에 표시되는 근거와
 * 아무 관계가 없었다. 값과 근거가 서로 모순돼도 화면이 둘 다 보여줬다.
 *
 * 지키는 것 두 가지:
 *   1. 값은 `Evidence.facts` 에서만 나온다. `summary` 문장은 읽지 않는다.
 *   2. 계산할 수 없으면 `null` 이다. 0 이 아니다 — 그 구분이 UNKNOWN 을 만들고,
 *      UNKNOWN 이 있으면 회의를 삭제하지 않는다.
 */

/** 값 하나 + 그 값을 만든 근거 + 사람에게 보여줄 계산 설명. */
export type Derived<T> = {
  value: T | null;
  evidenceIds: string[];
  note: string;
};

const unknown = <T>(note: string): Derived<T> => ({ value: null, evidenceIds: [], note });
const known = <T>(value: T, evidenceIds: string[], note: string): Derived<T> => ({ value, evidenceIds, note });

export type DerivedFacts = {
  /** Task 단위로 셀 수 있는 상태가 하나라도 있는가 */
  structuredState: Derived<boolean>;
  /** 가장 오래된 근거가 몇 시간 전 것인가 (최신성은 최악값으로 본다) */
  lastUpdatedHours: Derived<number>;
  /** 한 가지로 읽히지 않는 상태 근거의 수 */
  ambiguousStatusCount: Derived<number>;
  /** 안건 종류별 개수. 이미 답이 나온 안건은 빼고 센다. */
  agendaCounts: Derived<{ info: number; question: number; decision: number }>;
  /** 이미 어딘가에서 답이 나와 다시 물을 필요가 없는 안건 */
  alreadyAnswered: Derived<string[]>;
  /** 아직 이 내용을 주입받지 못한 참석 후보 */
  undelivered: Derived<string[]>;
  /** 선행 조건 체크리스트 */
  checklist: Derived<{ done: number; total: number }>;
  /** 잔존 P1 결함 */
  openP1: Derived<number>;
  /** 정책으로 답할 수 없는 결정 안건의 수 */
  openValueJudgments: Derived<number>;
  /** 관련 작업의 소유자 */
  owner: Derived<string>;
  /** 증상이 알림으로 계측됐는가 */
  alertCount: Derived<number>;
  /** 1위·2위 원인 가설의 점수 차 */
  hypothesisGap: Derived<number>;
  /** 이번 판정에 적용된 최신성 기준 (조직 설정값) */
  freshWithinHours: number;
};

/** 안건 제목과 근거 문장이 실제로 겹치는가. 두 단어 이상 겹쳐야 같은 건으로 본다. */
function overlaps(a: string, b: string): boolean {
  const tk = (x: string) =>
    new Set(x.toLowerCase().split(/[^a-z0-9가-힣]+/).filter((w) => w.length >= 2));
  const at = tk(a);
  const bt = tk(b);
  let n = 0;
  for (const w of at) if (bt.has(w)) n += 1;
  return n >= 2;
}

const hoursBetween = (iso: string, now: number) =>
  Math.max(0, Math.round(((now - new Date(iso).getTime()) / 3_600_000) * 10) / 10);

export function deriveFacts(input: {
  evidence: Evidence[];
  agenda: AgendaItem[];
  attendeeCandidates: string[];
  meetingType: MeetingType;
  activePolicies: Policy[];
  patternKey: string | null;
  now: number;
}): DerivedFacts {
  const { evidence, agenda, attendeeCandidates, meetingType, activePolicies, patternKey, now } = input;

  const withFacts = evidence.filter((e) => e.facts);
  const statusEv = evidence.filter((e) => e.kind === 'TASK_STATUS');

  // ── 셀 수 있는 상태가 있는가 ────────────────────────────────────
  const counted = statusEv.filter(
    (e) => typeof e.facts?.taskDone === 'number' && typeof e.facts?.taskTotal === 'number',
  );
  const structuredState = statusEv.length === 0
    ? unknown<boolean>('상태를 담은 근거가 하나도 없습니다.')
    : known(
        counted.length > 0,
        counted.map((e) => e.id),
        counted.length > 0
          ? `Task 단위로 계산된 상태 ${counted.length}건이 있습니다.`
          : '상태 근거는 있으나 Task 단위로 계산된 것이 없습니다.',
      );

  // ── 최신성 — 가장 오래된 근거를 쓴다 ────────────────────────────
  const lastUpdatedHours = evidence.length === 0
    ? unknown<number>('근거가 없어 갱신 시각을 알 수 없습니다.')
    : (() => {
        const oldest = evidence.reduce((a, b) =>
          new Date(a.observedAt) < new Date(b.observedAt) ? a : b);
        const h = hoursBetween(oldest.observedAt, now);
        return known(h, [oldest.id], `가장 오래된 근거가 ${h}시간 전 것입니다.`);
      })();

  // ── 모호성 — Task 단위 숫자가 없는 상태 근거의 수 ───────────────
  // "진행률 80%" 가 모호한 이유는 표현이 아니라 셀 수 없기 때문이다.
  const ambiguousEv = statusEv.filter(
    (e) => typeof e.facts?.taskDone !== 'number' || typeof e.facts?.taskTotal !== 'number',
  );
  const ambiguousStatusCount = statusEv.length === 0
    ? unknown<number>('대조할 상태 근거가 없습니다.')
    : known(
        ambiguousEv.length,
        ambiguousEv.map((e) => e.id),
        ambiguousEv.length === 0
          ? '모든 상태가 Task 단위(완료/전체)로 계산되어 있습니다.'
          : `${ambiguousEv.length}건이 Task 단위로 계산되지 않아 한 가지로 읽히지 않습니다.`,
      );

  // ── 이미 답이 나온 안건 ─────────────────────────────────────────
  // 정책은 같은 판단이 세 번 쌓여야 생기지만, 이건 한 번이면 된다.
  // 닫힌 결정과 같은 질문이면 회의가 아니라 링크 하나로 끝난다.
  const answerEv = evidence.filter((e) => e.kind === 'ANSWER' && e.facts?.answeredChoice);
  const answeredPairs = agenda
    .filter((a) => a.kind !== 'INFO')
    .map((a) => ({ a, hit: answerEv.find((e) => overlaps(a.title, e.summary)) }))
    .filter((x): x is { a: AgendaItem; hit: Evidence } => !!x.hit);

  const alreadyAnswered = answerEv.length === 0
    ? unknown<string[]>('닫힌 결정 기록이 없어 대조할 수 없습니다.')
    : known(
        answeredPairs.map((x) => x.a.id),
        answeredPairs.map((x) => x.hit.id),
        answeredPairs.length === 0
          ? '이미 답이 나온 안건은 없습니다.'
          : `안건 ${answeredPairs.length}건은 이미 답이 나왔습니다 — ${answeredPairs.map((x) => x.a.title).join(' · ')}.`,
      );

  // ── 안건 ────────────────────────────────────────────────────────
  const answeredIds = new Set(answeredPairs.map((x) => x.a.id));
  const live = agenda.filter((a) => !answeredIds.has(a.id));
  const agendaCounts = agenda.length === 0
    ? unknown<{ info: number; question: number; decision: number }>('분해된 안건이 없습니다.')
    : known(
        {
          info: live.filter((a) => a.kind === 'INFO').length,
          question: live.filter((a) => a.kind === 'QUESTION').length,
          decision: live.filter((a) => a.kind === 'DECISION').length,
        },
        [...live.flatMap((a) => a.evidenceIds), ...answeredPairs.map((x) => x.hit.id)],
        answeredIds.size === 0
          ? `안건 ${agenda.length}건을 확인·질의·결정으로 나눴습니다.`
          : `안건 ${agenda.length}건 중 ${answeredIds.size}건은 이미 답이 나와 빼고 셌습니다.`,
      );

  // ── 이미 전달됐는가 — 이 제품만 가진 근거 ───────────────────────
  // 이 제품의 존재 이유가 "요약이 동료 에이전트에게 흘러간다" 이므로,
  // 전원이 이미 주입받았다면 회의에서 공유할 것이 이미 도착해 있다.
  const deliveryEv = evidence.filter((e) => e.kind === 'DELIVERY' && e.facts?.deliveredTo);
  const undelivered = deliveryEv.length === 0 || attendeeCandidates.length === 0
    ? unknown<string[]>(
        deliveryEv.length === 0
          ? '주입 기록이 없어 전달 여부를 확인할 수 없습니다.'
          : '참석 후보가 지정되지 않아 대조할 대상이 없습니다.',
      )
    : (() => {
        const delivered = new Set(deliveryEv.flatMap((e) => e.facts?.deliveredTo ?? []));
        const missing = attendeeCandidates.filter((m) => !delivered.has(m));
        return known(
          missing,
          deliveryEv.map((e) => e.id),
          missing.length === 0
            ? `참석 후보 ${attendeeCandidates.length}명 전원이 이 내용을 이미 주입받았습니다.`
            : `${missing.length}명이 아직 받지 못했습니다 — ${missing.join(' · ')}.`,
        );
      })();

  // ── 선행 조건 체크리스트 ────────────────────────────────────────
  const checklistEv = withFacts.filter(
    (e) => typeof e.facts?.checklistDone === 'number' && typeof e.facts?.checklistTotal === 'number',
  );
  const checklist = checklistEv.length === 0
    ? unknown<{ done: number; total: number }>('체크리스트를 담은 근거가 들어오지 않았습니다.')
    : (() => {
        const done = checklistEv.reduce((s, e) => s + (e.facts?.checklistDone ?? 0), 0);
        const total = checklistEv.reduce((s, e) => s + (e.facts?.checklistTotal ?? 0), 0);
        return known({ done, total }, checklistEv.map((e) => e.id), `체크리스트 ${done}/${total} 완료.`);
      })();

  // ── 잔존 P1 ─────────────────────────────────────────────────────
  const p1Ev = withFacts.filter((e) => typeof e.facts?.openP1 === 'number');
  const openP1 = p1Ev.length === 0
    ? unknown<number>('결함 등급을 담은 근거가 없습니다.')
    : (() => {
        const n = p1Ev.reduce((s, e) => s + (e.facts?.openP1 ?? 0), 0);
        return known(n, p1Ev.map((e) => e.id), n === 0 ? 'P1 결함 0건.' : `P1 결함 ${n}건 잔존.`);
      })();

  // ── 남은 가치판단 — 정책으로 답할 수 없는 결정 안건 ─────────────
  const policy = activePolicies.find(
    (p) => p.status === 'ACTIVE' && patternKey && p.patternKey === patternKey,
  ) ?? null;
  const openValueJudgments = agendaCounts.value === null
    ? unknown<number>('안건을 분해하지 못해 셀 수 없습니다.')
    : (() => {
        const n = Math.max(0, agendaCounts.value.decision - (policy ? 1 : 0));
        return known(
          n,
          agenda.filter((a) => a.kind === 'DECISION').flatMap((a) => a.evidenceIds),
          policy
            ? `결정 안건 ${agendaCounts.value.decision}건 중 1건은 정책 "${policy.title}" 으로 답합니다 — 남은 판단 ${n}건.`
            : `정책으로 답할 수 없는 결정 안건 ${n}건.`,
        );
      })();

  // ── 담당자 ──────────────────────────────────────────────────────
  const ownerEv = withFacts.find((e) => typeof e.facts?.owner === 'string');
  const owner = ownerEv
    ? known(ownerEv.facts!.owner!, [ownerEv.id], `관련 작업의 소유자는 ${ownerEv.facts!.owner} 입니다.`)
    : unknown<string>('소유자를 담은 근거가 없습니다.');

  // ── 알림 ────────────────────────────────────────────────────────
  const alertEv = withFacts.filter((e) => typeof e.facts?.alertCount === 'number');
  const alertCount = alertEv.length === 0
    ? unknown<number>('알림 근거가 들어오지 않아 계측 여부를 알 수 없습니다.')
    : (() => {
        const n = alertEv.reduce((s, e) => s + (e.facts?.alertCount ?? 0), 0);
        return known(n, alertEv.map((e) => e.id), `알림 ${n}건이 계측되었습니다.`);
      })();

  // ── 원인 가설 ───────────────────────────────────────────────────
  // 사람이 정리해 둔 점수만 읽는다. 없으면 추정하지 않고 모른다고 한다.
  const hypEv = withFacts.find((e) => Array.isArray(e.facts?.hypothesisScores));
  const hypothesisGap = !hypEv
    ? unknown<number>('정리된 원인 가설이 없어 점수 차를 계산할 수 없습니다.')
    : (() => {
        const sorted = [...(hypEv.facts!.hypothesisScores ?? [])].sort((a, b) => b - a);
        if (sorted.length < 2) {
          return known(1, [hypEv.id], '가설이 하나뿐입니다.');
        }
        const gap = Math.round((sorted[0] - sorted[1]) * 100) / 100;
        return known(gap, [hypEv.id], `1위 ${sorted[0].toFixed(2)} · 2위 ${sorted[1].toFixed(2)} · 차이 ${gap.toFixed(2)}.`);
      })();

  return {
    structuredState,
    lastUpdatedHours,
    ambiguousStatusCount,
    agendaCounts,
    undelivered,
    checklist,
    openP1,
    openValueJudgments,
    owner,
    alertCount,
    hypothesisGap,
    alreadyAnswered,
    freshWithinHours: FRESH_WITHIN_HOURS[meetingType],
  };
}
