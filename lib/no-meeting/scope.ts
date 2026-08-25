/**
 * 요청과 사실을 잇는 층 — **커넥터를 붙여도 여기서 안 이어지면 아무 일도 일어나지 않는다.**
 *
 * 이 파일이 있기 전에는 근거를 제목 단어가 두 개 겹치는지로만 붙였다. 한국어는
 * 조사가 붙어 "결제를" 과 "결제" 가 다른 토큰이 되므로 실제 신청서에서는 거의
 * 붙지 않았다. 붙지 않은 근거는 없는 근거고, 없는 근거는 UNKNOWN 이며, UNKNOWN 이
 * 하나라도 있으면 회의를 삭제하지 않는다 — 커넥터가 아무리 정확해도 판정이 한 발짝도
 * 못 나가는 지점이 여기였다.
 *
 * 잇는 축을 셋으로 나눈다. **위에서부터 시도하고, 신청자에게 일을 시키지 않는 순서다.**
 *
 *   1. SCOPE  — 제목·본문에 이슈키(PAY-118)나 브랜치가 적혀 있으면 그것으로 잇는다.
 *               적는 팀은 이미 적고 있고, 안 적는 팀에게 적으라고 하지 않는다.
 *   2. PEOPLE — 부른 사람들이 최근에 건드린 사실. **신청자가 아무것도 안 써도 작동한다.**
 *               이 제품이 기본으로 기대야 하는 축이다.
 *   3. WORDS  — 위 둘이 아무것도 못 잡았을 때만. 조사를 감안해 어간까지 같은 말로 본다.
 *
 * 어느 축으로 붙었는지를 근거에 남긴다. "이 근거로 판정했다" 가 검증 가능해야
 * 하고, 3번으로 붙은 근거는 사람이 의심할 수 있어야 하기 때문이다.
 */

import { BIND_WINDOW_HOURS } from './settings';
import type { Evidence, MeetingRequest } from './types';

// ── 1. 스코프 키 ──────────────────────────────────────────────────

/** `PAY-118` · `SRCH-77` — 이슈트래커가 쓰는 키. */
const ISSUE_KEY = /\b([A-Za-z][A-Za-z0-9]{1,9})-(\d{1,6})\b/g;
/** `feature/payment` · `fix/pay-500` — 슬래시가 있어야 브랜치로 본다. */
const BRANCH = /\b([a-z][a-z0-9._-]*\/[a-z0-9._/-]{2,60})\b/gi;
/** `commerce-api` · `pay-worker` — 하이픈이 있는 영문 서비스·레포 이름. */
const SERVICE = /\b([a-z][a-z0-9]*(?:-[a-z0-9]+){1,4})\b/gi;

/** 서비스 정규식이 잡아버리는 흔한 일반어. 대상이 아니다. */
const SERVICE_STOP = new Set([
  'e-mail', 'day-to-day', 'go-no', 'no-go', 'read-only',
  'follow-up', 'kick-off', 'stand-up', 'one-on-one', 'to-do', 'q-a',
]);

export const normalizeScopeKey = (raw: string): string =>
  raw.trim().toLowerCase().replace(/\s+/g, '');

/**
 * **문장에서는 이슈키만 뽑는다.**
 *
 * 처음에는 브랜치·서비스 패턴도 문장에 돌렸는데, 실데이터에 태워 보니 세션 요약문의
 * 파일 경로를 브랜치로 집어냈다 — `app/signup/page.tsx` · `auth/.field/.button` ·
 * `mock-stores` · `next` 같은 것들이 대상 이름으로 쌓였다. SCOPE 는 걸리면 무조건
 * 붙는 가장 강한 축이라, 여기서 나온 오탐은 관련 없는 근거를 판정에 밀어 넣는다.
 *
 * 이슈키(`PAY-118`)만 남긴 이유는 그것만이 문장 안에서도 모호하지 않기 때문이다.
 * 브랜치·서비스 이름은 **그 이름이 들어 있는 자리**(브랜치 필드 · Jira 컴포넌트 ·
 * Sentry 슬러그 · 사람이 직접 적은 칸)에서만 뽑는다 — `extractNameKeys`.
 */
export function extractRefKeys(text: string): string[] {
  if (!text) return [];
  const out = new Set<string>();
  for (const m of text.matchAll(ISSUE_KEY)) out.add(normalizeScopeKey(`${m[1]}-${m[2]}`));
  return [...out];
}

/**
 * **이름이 들어 있는 자리에서** 대상 이름을 뽑는다.
 * 브랜치 필드, Jira 컴포넌트·라벨, Sentry 프로젝트 슬러그처럼 그 값이 곧 이름인 곳.
 * 문장에는 돌리지 않는다 (위 주석).
 */
export function extractNameKeys(value: string): string[] {
  if (!value) return [];
  const out = new Set<string>(extractRefKeys(value));

  for (const m of value.matchAll(BRANCH)) {
    const key = normalizeScopeKey(m[1]);
    out.add(key);
    // `feature/payment` 는 `payment` 이야기이기도 하다.
    const tail = key.split('/').pop();
    if (tail && tail.length >= 3) out.add(tail);
  }

  for (const m of value.matchAll(SERVICE)) {
    const key = normalizeScopeKey(m[1]);
    if (SERVICE_STOP.has(key)) continue;
    if (/-\d+$/.test(key)) continue;   // 이슈키는 위에서 이미 넣었다
    out.add(key);
  }

  // 하이픈도 슬래시도 없는 한 낱말은 대상 이름으로 보기에 너무 흔하다.
  return [...out].filter((k) => k.includes('-') || k.includes('/') || /^[a-z][a-z0-9]*-/.test(k));
}

/** 사람이 직접 적어 넣은 칸 (선택 입력). */
export const parseScopeInput = (raw: string): string[] =>
  raw
    ? [...new Set(raw.split(/[,\n\s]+/).map(normalizeScopeKey).filter((s) => s.length >= 2))].slice(0, 20)
    : [];

export function mergeScopeKeys(...lists: (string[] | undefined | null)[]): string[] {
  const out = new Set<string>();
  for (const l of lists) for (const k of l ?? []) {
    const n = normalizeScopeKey(k);
    if (n.length >= 2) out.add(n);
  }
  return [...out].slice(0, 30);
}

// ── 3. 조사를 감안한 단어 겹침 ────────────────────────────────────

export const tokenize = (s: string): string[] =>
  [...new Set(s.toLowerCase().split(/[^a-z0-9가-힣]+/).filter((w) => w.length >= 2))];

const HANGUL = /^[가-힣]+$/;

/** `리팩터링한` 과 `리팩터링` 은 같은 말이다. 한글일 때만 어간 비교를 한다. */
function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  if (!HANGUL.test(a) || !HANGUL.test(b)) return false;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 2 && long.startsWith(short);
}

export function looseOverlap(a: string, b: string): number {
  const at = tokenize(a);
  const bt = tokenize(b);
  let n = 0;
  for (const w of at) if (bt.some((x) => sameWord(w, x))) n += 1;
  return n;
}

// ── 잇기 ──────────────────────────────────────────────────────────

const hoursAgo = (iso: string, now: number) => (now - new Date(iso).getTime()) / 3_600_000;

/**
 * 이 요청에 실제로 걸리는 근거를 고른다.
 *
 * 세 축을 **전부** 시도하고 합집합을 쓴다. 위 축에서 이미 붙은 근거는 그 이유를 유지한다 —
 * 더 강한 근거로 붙은 것을 약한 이유로 덮어쓰면 화면이 실제보다 못 미덥게 보인다.
 */
export function bindEvidence(
  req: Pick<MeetingRequest, 'title' | 'agenda' | 'scopeKeys' | 'attendeeCandidates' | 'requestedBy'>,
  pool: Evidence[],
  now: number,
): Evidence[] {
  const text = [req.title, ...req.agenda.map((a) => a.title)].join(' ');
  const scope = new Set(req.scopeKeys ?? []);
  const people = new Set([...(req.attendeeCandidates ?? []), req.requestedBy].filter(Boolean));

  const bound = new Map<string, Evidence>();

  const add = (e: Evidence, via: Evidence['boundVia'], why: string) => {
    if (bound.has(e.id)) return;
    bound.set(e.id, { ...e, boundVia: via, boundReason: why });
  };

  // 1. 스코프 키
  if (scope.size > 0) {
    for (const e of pool) {
      const hit = (e.scopeKeys ?? []).find((k) => scope.has(k));
      if (hit) add(e, 'SCOPE', `신청서와 이 사실이 같은 대상(${hit})을 가리킵니다.`);
    }
  }

  // 2. 참석자 ∩ 시간창 — 신청자가 아무것도 안 써도 작동하는 축
  if (people.size > 0) {
    for (const e of pool) {
      const owner = e.facts?.owner;
      if (!owner || !people.has(owner)) continue;
      const h = hoursAgo(e.observedAt, now);
      if (h > BIND_WINDOW_HOURS) continue;
      add(e, 'PEOPLE',
        `${owner} 님이 ${Math.max(0, Math.round(h))}시간 전에 남긴 사실이고, 이 회의에 부른 사람입니다.`);
    }
  }

  // 3. 단어 겹침 — 위 둘이 아무것도 못 잡았을 때만
  if (bound.size === 0) {
    for (const e of pool) {
      if (looseOverlap(text, `${e.summary} ${e.sourceRef}`) >= 2) {
        add(e, 'WORDS', '신청서와 이 사실에 같은 낱말이 겹칩니다. 대상이 같은지는 확인되지 않았습니다.');
      }
    }
  }

  return [...bound.values()];
}
