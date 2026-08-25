import type { GateStatus, MeetingType, Outcome } from './types';

/**
 * enum 하나당 라벨·색·설명을 한 곳에서만 정의한다.
 * 다섯 화면이 같은 단어를 쓰지 않으면 판정은 신뢰를 잃는다.
 */

export const OUTCOME: Record<Outcome, {
  label: string; short: string; ink: string; blurb: string;
}> = {
  DELETE: { label: '회의 없음', short: 'DELETE', ink: 'var(--verdict-delete)',
    blurb: '조건을 전부 충족했습니다. 이 회의는 열리지 않아도 됩니다.' },
  ASYNC:  { label: '비동기 처리', short: 'ASYNC', ink: 'var(--verdict-async)',
    blurb: '모이지 않고 해결 로그로 끝납니다. 다만 조건 하나가 남아 있습니다.' },
  DECIDE: { label: '사람 결정', short: 'DECIDE', ink: 'var(--verdict-decide)',
    blurb: '조건은 다 충족됐고 가치판단 한 건만 남았습니다.' },
  SHRINK: { label: '축소 개최', short: 'SHRINK', ink: 'var(--verdict-shrink)',
    blurb: '동시 대화가 필요합니다. 대신 더 적은 사람과 더 짧게 엽니다.' },
  MEET:   { label: '회의 유지', short: 'MEET', ink: 'var(--verdict-meet)',
    blurb: '이 회의는 없앨 수 없습니다.' },
};

export const OUTCOME_ARTIFACT: Record<Outcome, string> = {
  DELETE: '해결 로그', ASYNC: '해결 로그', DECIDE: '결정 카드',
  SHRINK: '회의 처방전', MEET: '회의 처방전',
};

export const TYPE: Record<MeetingType, { code: string; label: string; note: string }> = {
  STATUS:          { code: 'T1', label: '정보 공유 / Status', note: '조건 5개를 검사합니다.' },
  DECISION:        { code: 'T2', label: '의사결정',           note: '조건 5개를 검사합니다.' },
  PROBLEM_SOLVING: { code: 'T3', label: '문제 해결',           note: '조건 5개를 검사합니다.' },
  PLANNING:        { code: 'T4', label: '조율 / Planning',     note: '조건 5개를 검사합니다.' },
  BRAINSTORMING:   { code: 'T5', label: 'Brainstorming',      note: '분석하지 않습니다. 항상 회의를 엽니다.' },
  FEEDBACK_1ON1:   { code: 'T6', label: 'Feedback / 1:1',     note: '제목조차 읽지 않습니다. 항상 회의를 엽니다.' },
  CONFLICT_CRISIS: { code: 'T7', label: '갈등 / 위기',         note: '앞당기거나 축소합니다.' },
  UNCLASSIFIED:    { code: 'T8', label: '미분류',              note: '목적을 한 줄 되묻습니다.' },
};

export const GATE: Record<GateStatus, { mark: string; label: string; ink: string }> = {
  PASS:           { mark: '✓', label: '충족',   ink: 'var(--live)' },
  FAIL:           { mark: '✕', label: '미충족', ink: 'var(--stamp)' },
  UNKNOWN:        { mark: '?', label: '확인 불가', ink: 'var(--verdict-shrink)' },
  NOT_APPLICABLE: { mark: '—', label: '해당 없음', ink: 'var(--ink-faint)' },
};

export const LEDGER_EVENT: Record<string, { label: string; ink: string }> = {
  EVALUATED:        { label: '판정',      ink: 'var(--ink-faint)' },
  DECIDED:          { label: '결정',      ink: 'var(--verdict-decide)' },
  REVERTED:         { label: '되돌림',    ink: 'var(--verdict-shrink)' },
  POLICY_ACTIVATED: { label: '정책 등록', ink: 'var(--live)' },
};

/** 기존 화면(components/decision-inbox.tsx)과 같은 상대시각 표기를 쓴다. */
export function whenLabel(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const future = diff < 0;
  const m = Math.round(Math.abs(diff) / 60_000);
  const body =
    m < 1 ? '방금' : m < 60 ? `${m}분` : m < 60 * 24 ? `${Math.round(m / 60)}시간` : `${Math.round(m / 1440)}일`;
  if (body === '방금') return body;
  return future ? `${body} 뒤` : `${body} 전`;
}

export function clockLabel(iso: string): string {
  const d = new Date(iso);
  const mm = `${d.getMonth() + 1}`.padStart(2, '0');
  const dd = `${d.getDate()}`.padStart(2, '0');
  const hh = `${d.getHours()}`.padStart(2, '0');
  const mi = `${d.getMinutes()}`.padStart(2, '0');
  return `${mm}/${dd} ${hh}:${mi}`;
}
