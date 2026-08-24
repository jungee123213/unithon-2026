import type { ContextItem } from './types';
import { INJECT_MAX_CHARS } from './types';

/** "3분 전", "2시간 전" — 주입 문자열과 영수증 뷰가 같은 표현을 쓴다. */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const diffMs = now.getTime() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return '방금';
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  return `${Math.floor(hr / 24)}일 전`;
}

/**
 * §5.3 주입 템플릿 — 이 문자열이 곧 제품이다.
 *
 * 영수증 뷰(FR-5.1)가 이것을 그대로 렌더링하므로, 훅에서도 프론트에서도 가공하지 않는다.
 * 누적 2000자를 넘으면 절단한다 (§5.2). 상한이 없으면 도그푸딩 3시간째에
 * 요약 40개짜리 벽이 모든 세션의 첫 토큰을 잡아먹는다.
 *
 * 꼬리말("사람을 거치지 않고 도착했습니다. 확인할 필요 없습니다")은 뺐다.
 * 받는 에이전트가 그 문장 때문에 블록 전체를 "출처 불명"으로 의심하고 무시하는 걸
 * 실측에서 세 번 확인했다. 신뢰를 요구하는 문장이 오히려 신뢰를 깎았다.
 */
export function renderInjection(
  items: ContextItem[],
  project: string,
  now: Date = new Date(),
): { injection: string; used: ContextItem[] } {
  if (items.length === 0) return { injection: '', used: [] };

  // 대괄호 안은 프로젝트 이름이다. 어느 프로젝트의 맥락인지가 먼저 보여야
  // 받는 에이전트가 "지금 내가 하는 일과 관련 있는가"를 바로 판단한다.
  const header =
    `[${project}] 이 프로젝트에서 당신이 마지막으로 작업한 이후 동료 에이전트가 남긴 것:\n`;

  const used: ContextItem[] = [];
  const blocks: string[] = [];
  let budget = INJECT_MAX_CHARS - header.length;

  for (const item of items) {
    const block = `\n${used.length + 1}. ${item.member} · ${relativeTime(item.created_at, now)}\n   ${item.summary}\n`;
    if (block.length > budget) break;      // 절단: 반쪽 요약을 넣느니 다음 세션으로 미룬다
    blocks.push(block);
    used.push(item);
    budget -= block.length;
  }

  if (used.length === 0) return { injection: '', used: [] };
  return { injection: header + blocks.join(''), used };
}
