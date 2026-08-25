import type { MeetingType } from './types';

/**
 * 조직이 정하는 값들.
 *
 * 여기 있는 숫자는 데이터에서 나오지 않는다 — 조직이 고른 기준이다.
 * 그래서 시나리오별 슬라이더가 아니라 한 곳에 모아 두고, 화면에 그대로 표기한다.
 * 하나의 숫자를 모든 업무에 쓰지 않기 위해 유형별로 나눈다.
 */

/** 상태가 이 시간 안에 갱신됐어야 "최신" 으로 본다. */
export const FRESH_WITHIN_HOURS: Record<MeetingType, number> = {
  STATUS: 3,
  DECISION: 12,
  PROBLEM_SOLVING: 6,
  PLANNING: 24,
  BRAINSTORMING: 24,
  FEEDBACK_1ON1: 24,
  CONFLICT_CRISIS: 3,
  UNCLASSIFIED: 24,
};

/**
 * 참석자 축으로 근거를 붙일 때 보는 시간 창.
 *
 * "부른 사람들이 **최근에** 건드린 것" 의 최근이 며칠인가. 최신성 기준(위)보다
 * 넉넉해야 한다 — 판정 대상으로 삼는 범위와, 그 값이 최신인지 따지는 기준은 다른 문제다.
 * 넓힐수록 관련 없는 사실이 딸려 들어와 조건이 FAIL 로 기울고, 그 방향이 안전한 쪽이다.
 */
export const BIND_WINDOW_HOURS = 72;

/** 분류기가 스스로 손을 드는 지점. 1·2위 차가 이보다 작으면 확정하지 않는다. */
export const TYPE_GAP_THRESHOLD = 0.2;

/** 같은 판단이 몇 번 반복되면 정책 후보가 되는가. */
export const POLICY_THRESHOLD = 3;

/**
 * 규칙 버전. 판정 스냅샷에 박혀서 "그때 무슨 규칙으로 그렇게 판정했는지" 를 남긴다.
 * **게이트의 판정 기준이 바뀌면 올린다.** 문구만 바뀐 것으로는 올리지 않는다.
 *
 * p1.1 — 최신성이 소스별 최신값을 보도록 바뀌었고(전에는 근거 전체의 최오래),
 *        T3 의 원인 조건이 점수 차에서 "배제하지 못한 후보 수" 로 바뀌었다.
 * p1.2 — 세션 요약이 상태 근거에서 빠졌다(`WORK_LOG`). 전에는 이슈트래커가 상태를
 *        정확히 세어 줘도 세션 요약 때문에 해석 모호성이 FAIL 이라 회의가 사라지지
 *        않았다. 같은 입력에 ASYNC 였던 것이 DELETE 가 될 수 있는 변경이다.
 */
export const RULE_VERSION = '2026-08-p1.2';
