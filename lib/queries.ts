import { serverClient } from './supabase';
import { getCounters, type Counters } from './counters';
import { groupProgress, type ProgressSection } from './progress';
import type { ContextRow, DecisionRow } from './types';

export type SessionCard = ContextRow & {
  /** 이 컨텍스트를 흡수해 간 동료들 — "읽으세요"가 아니라 "흡수됐습니다"의 근거(§7.2) */
  consumers: string[];
};

export type Receipt = {
  batch_id: string;
  member: string;          // 주입받은 쪽
  rendered: string;        // 실제로 주입된 문자열 그 자체 (FR-5.1)
  injected_at: string;
  items: number;
};

export type TeamSpaceData = {
  sessions: SessionCard[];
  receipts: Receipt[];
  counters: Counters;
  openDecisions: number;
};

export async function getTeamSpace(projectId: string): Promise<TeamSpaceData> {
  const db = serverClient();

  const [ctxRes, injRes, decRes, counters] = await Promise.all([
    db.from('context').select('*').eq('project_id', projectId)
      .order('id', { ascending: false }).limit(40),
    db.from('injections').select('*').eq('project_id', projectId)
      .order('injected_at', { ascending: false }).limit(200),
    db.from('decisions').select('id').eq('project_id', projectId).eq('status', 'open'),
    getCounters(projectId),
  ]);

  const injections = injRes.data ?? [];

  const consumersByContext = new Map<number, string[]>();
  for (const i of injections) {
    const list = consumersByContext.get(i.context_id) ?? [];
    if (!list.includes(i.member)) list.push(i.member);
    consumersByContext.set(i.context_id, list);
  }

  const sessions: SessionCard[] = (ctxRes.data ?? []).map((c: ContextRow) => ({
    ...c,
    consumers: consumersByContext.get(c.id) ?? [],
  }));

  // 영수증: 같은 SessionStart 에서 함께 주입된 묶음 하나 = 영수증 한 장
  const byBatch = new Map<string, Receipt>();
  for (const i of injections) {
    if (!i.batch_id || !i.rendered) continue;
    const prev = byBatch.get(i.batch_id);
    if (prev) { prev.items += 1; continue; }
    byBatch.set(i.batch_id, {
      batch_id: i.batch_id, member: i.member,
      rendered: i.rendered, injected_at: i.injected_at, items: 1,
    });
  }

  return {
    sessions,
    receipts: [...byBatch.values()]
      .sort((a, b) => b.injected_at.localeCompare(a.injected_at))
      .slice(0, 8),
    counters,
    openDecisions: (decRes.data ?? []).length,
  };
}

export async function getDecisions(projectId: string): Promise<DecisionRow[]> {
  const db = serverClient();
  const { data } = await db.from('decisions').select('*')
    .eq('project_id', projectId)
    .order('status', { ascending: true })
    .order('id', { ascending: false })
    .limit(50);
  return (data ?? []) as DecisionRow[];
}

/**
 * 진행사항 문서 (§4 W 를 넘지 않는다: 작업을 쪼개지 않고 진행률을 추정하지 않는다).
 * 하는 일은 context 행을 브랜치로 묶고, branches 테이블의 git 사실을 붙이는 것뿐이다.
 */
export async function getProgress(projectId: string): Promise<ProgressSection[]> {
  const db = serverClient();

  const [ctxRes, brRes] = await Promise.all([
    db.from('context').select('*').eq('project_id', projectId)
      .order('id', { ascending: false }).limit(300),
    db.from('branches').select('branch, merged').eq('project_id', projectId),
  ]);

  const merged = (brRes.data ?? []).filter((b) => b.merged).map((b) => b.branch);
  return groupProgress((ctxRes.data ?? []) as ContextRow[], { merged });
}
