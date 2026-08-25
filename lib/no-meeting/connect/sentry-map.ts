import { normalizeScopeKey } from '../scope';
import type { Evidence } from '../types';
import type { IdentityMap } from './store';

/**
 * Sentry 응답 → 근거. **순수 변환만 한다** (`jira-map.ts` 와 같은 이유로 분리했다).
 *
 * 이 커넥터가 여는 조건은 하나뿐이다 — `symptom_measured`.
 * "회의보다 서버가 먼저 말한다" 가 이 소스의 존재 이유고, 그 이상을 주장하지 않는다.
 * 원인 후보는 여기서 오지 않는다. Sentry 는 무슨 일이 났는지를 알지, 왜 났는지는 모른다.
 */

export type SentryIssue = {
  id: string;
  shortId?: string;
  title?: string;
  culprit?: string;
  level?: string;
  count?: string | number;
  userCount?: number;
  lastSeen?: string;
  project?: { slug?: string };
  assignedTo?: { name?: string; email?: string } | null;
};

const toCount = (v: string | number | undefined): number => {
  const n = typeof v === 'string' ? Number(v) : v;
  return Number.isFinite(n) ? Number(n) : 0;
};

/**
 * 이슈 하나 = 근거 한 줄.
 *
 * `alertCount` 는 Sentry 의 `count` — **그 이슈의 누적 이벤트 수**다. 최근 N시간치가
 * 아니다(`statsPeriod` 는 응답의 `stats` 키만 제어하고 결과를 거르지 않는다).
 * 어느 이슈를 가져올지는 `query` 의 `is:unresolved lastSeen:-Nh` 가 정한다.
 * 그래서 문장에도 "누적" 이라고 쓴다 — 숫자가 무엇의 개수인지 화면이 틀리게 말하면
 * 사람은 그 숫자로 판단한다.
 *
 * 0 이 아니라 "모름" 이 되는 경우는 여기서 만들지 않는다 — Sentry 가 이슈를 돌려줬다는
 * 것 자체가 계측됐다는 뜻이기 때문이다. 이슈가 하나도 없으면 근거를 만들지 않고,
 * 파생 계층이 UNKNOWN 을 만든다.
 */
export function issuesToEvidence(issues: SentryIssue[], identityMap: IdentityMap): Evidence[] {
  return issues.map((i) => {
    const count = toCount(i.count);
    const slug = i.project?.slug ?? '';
    const owner = i.assignedTo?.name;

    return {
      id: `ev-sentry-${i.id}`,
      source: 'alerts',
      sourceRef: `sentry:${i.shortId ?? i.id}`,
      kind: 'ALERT',
      summary: [
        i.title ?? '(제목 없음)',
        i.culprit,
        `누적 ${count}건`,
        i.userCount ? `사용자 ${i.userCount}명 영향` : null,
      ].filter(Boolean).join(' · '),
      observedAt: i.lastSeen ?? new Date().toISOString(),
      facts: {
        alertCount: count,
        // 매핑이 없으면 옮기지 않고 원래 이름을 둔다. 없는 대응을 지어내지 않는다.
        owner: owner ? (identityMap?.[owner] ?? owner) : undefined,
      },
      scopeKeys: [slug, i.culprit ?? '']
        .filter(Boolean).map(normalizeScopeKey).filter((k) => k.length >= 2),
    };
  });
}
