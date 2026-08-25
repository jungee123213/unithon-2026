import type { ResponseStats } from './engine';
import { POLICY_THRESHOLD } from './settings';
import type { LedgerEntry, Policy } from './types';

/**
 * 원장에서 세는 것들 — **순수 계산이다. DB 도 네트워크도 여기 없다.**
 *
 * `queries.ts` 에서 떼어냈다. 그 파일은 커넥터 I/O(`connect/*`)를 끌어오고,
 * 그쪽은 `server-only` 로 시작해 Next 번들러 밖에서는 아예 불러올 수 없다.
 * 시드 스크립트처럼 순수 node 로 도는 것이 이 계산을 쓰려다 통째로 막혔다.
 * `jira-map.ts` 를 `jira.ts` 에서 떼어낸 것과 같은 이유다.
 */

export type PolicyCandidate = {
  patternKey: string;
  selectedOptionKey: string;
  decisionCount: number;
  threshold: number;
  sourceDecisions: { id: string; date: string; title: string }[];
};


/**
 * 정책 후보는 저장하지 않는다. 원장에서 센다.
 * 되돌린 결정은 빼고 센다 — 잘못된 판단이 정책으로 굳는 것을 막는 규칙이다.
 */
export function findCandidates(ledger: LedgerEntry[], policies: Policy[]): PolicyCandidate[] {
  const reverted = new Set(
    ledger.filter((l) => l.eventType === 'REVERTED' && l.evaluationId).map((l) => l.evaluationId),
  );
  const existing = new Set(policies.map((p) => `${p.patternKey}::${p.selectedOptionKey}`));
  const byKey = new Map<string, LedgerEntry[]>();

  for (const l of ledger) {
    if (l.eventType !== 'DECIDED' || !l.patternKey || !l.selectedOptionKey) continue;
    if (l.evaluationId && reverted.has(l.evaluationId)) continue;
    const key = `${l.patternKey}::${l.selectedOptionKey}`;
    if (existing.has(key)) continue;
    byKey.set(key, [...(byKey.get(key) ?? []), l]);
  }

  return [...byKey.entries()]
    .map(([key, entries]) => {
      const [patternKey, selectedOptionKey] = key.split('::');
      return {
        patternKey, selectedOptionKey,
        decisionCount: entries.length,
        threshold: POLICY_THRESHOLD,
        sourceDecisions: entries.map((e) => ({
          id: e.id, date: e.occurredAt.slice(0, 10), title: e.title,
        })),
      };
    })
    .sort((a, b) => b.decisionCount - a.decisionCount);
}

/** 판정 한 건. 스냅샷이므로 저장된 payload 를 그대로 돌려준다. */
export function responseStats(ledger: LedgerEntry[]): ResponseStats {
  const raisedAt = new Map<string, string>();
  for (const l of ledger) {
    if (l.eventType === 'EVALUATED' && l.evaluationId) raisedAt.set(l.evaluationId, l.occurredAt);
  }

  const byMember = new Map<string, number[]>();
  for (const l of ledger) {
    if (l.eventType !== 'DECIDED' || !l.evaluationId) continue;
    const raised = raisedAt.get(l.evaluationId);
    if (!raised) continue;
    const hours = (new Date(l.occurredAt).getTime() - new Date(raised).getTime()) / 3_600_000;
    if (hours < 0) continue;
    byMember.set(l.actor, [...(byMember.get(l.actor) ?? []), hours]);
  }

  const out: ResponseStats = {};
  for (const [member, list] of byMember) {
    const sorted = [...list].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
    out[member] = { medianHours: Math.round(median * 10) / 10, count: sorted.length };
  }
  return out;
}
