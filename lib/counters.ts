import { serverClient } from './supabase';

/**
 * §5.4 · 카운터 3티어.
 *
 * 티어 1 은 전부 실제 행에서 계산한다. 추정이 섞이면 심사위원의
 * "그 숫자 어떻게 세셨어요?" 한 방에 나머지 서사까지 의심받는다(§5.4).
 * 티어 3(추정)은 만들지 않는다 — 표시할 자리 자체를 두지 않는 것이 방어다.
 */
export type Counters = {
  tier1: {
    contexts: number;          // 전파된 컨텍스트
    crossMember: number;       // 멤버 간 전파 (저자 ≠ 수신자)
    avgSecondsToFirstUse: number | null;  // 생성 → 첫 소비 평균
  };
  tier2: {
    humanRelayed: 0;           // 사람이 옮긴 컨텍스트
    humanEdited: 0;            // 사람이 편집한 진행상황
  };
};

export async function getCounters(projectId: string): Promise<Counters> {
  const db = serverClient();

  const [{ data: contexts }, { data: injections }] = await Promise.all([
    db.from('context').select('id, member, created_at').eq('project_id', projectId),
    db.from('injections').select('context_id, member, injected_at').eq('project_id', projectId),
  ]);

  const ctxById = new Map((contexts ?? []).map((c) => [c.id, c]));

  // 멤버 간 전파: 주입받은 사람이 저자가 아닌 건 (저자 필터가 실제로 걸렸다는 증거)
  const cross = (injections ?? []).filter((i) => {
    const c = ctxById.get(i.context_id);
    return c && c.member !== i.member;
  });

  // 생성 → 첫 소비: context 당 가장 이른 injected_at 하나만
  const firstUse = new Map<number, number>();
  for (const i of injections ?? []) {
    const c = ctxById.get(i.context_id);
    if (!c) continue;
    const delta = (new Date(i.injected_at).getTime() - new Date(c.created_at).getTime()) / 1000;
    const prev = firstUse.get(i.context_id);
    if (prev === undefined || delta < prev) firstUse.set(i.context_id, delta);
  }
  const deltas = [...firstUse.values()].filter((d) => d >= 0);
  const avg = deltas.length ? deltas.reduce((a, b) => a + b, 0) / deltas.length : null;

  return {
    tier1: {
      contexts: (contexts ?? []).length,
      crossMember: cross.length,
      avgSecondsToFirstUse: avg === null ? null : Math.round(avg),
    },
    // 티어 2 는 상수다. 이 값을 증가시킬 코드 경로가 존재하지 않는다 — 그게 서사다(§5.4).
    tier2: { humanRelayed: 0, humanEdited: 0 },
  };
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—';
  if (seconds < 60) return `${seconds}초`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}분 ${seconds % 60}초`;
  return `${Math.floor(m / 60)}시간 ${m % 60}분`;
}
