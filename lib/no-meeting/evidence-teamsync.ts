import { serverClient } from '../supabase';
import type { ContextRow } from '../types';
import { extractNameKeys, extractRefKeys, mergeScopeKeys } from './scope';
import type { Evidence } from './types';

/**
 * TeamSync 를 판정 근거로 바꾸는 층 — **실물이 붙어 있는 유일한 커넥터.**
 *
 * 여기서 하지 않는 것 두 가지 (`lib/progress.ts` 와 같은 방어선):
 *   - 진행률을 추정하지 않는다. 상태는 git 머지 여부라는 사실에서만 나온다.
 *   - 요약 문장을 파싱해 숫자를 뽑지 않는다. 문장은 `summary` 로만 쓴다.
 *
 * 그래서 `taskDone/taskTotal` 을 여기서 만들지 않고, 근거의 종류도 `WORK_LOG` 다.
 * TeamSync 요약은 "무엇을 했는가" 이지 "24건 중 24건" 이 아니기 때문이다 —
 * 셀 수 있는 상태는 이슈트래커에서만 온다. 그 결과 TeamSync 만 연결된 팀은
 * "Source of Truth 존재" 가 UNKNOWN 이 되고, UNKNOWN 이면 회의를 삭제하지 않는다.
 * 그게 맞다. 없는 것을 있다고 하지 않는다.
 */

const BASE_BRANCHES = ['main', 'master', 'develop'];

export type TeamSyncEvidence = {
  evidence: Evidence[];
  /** 근거를 만든 멤버들 — 참석 후보 추천에 쓴다 */
  members: string[];
};

export async function loadTeamSyncEvidence(projectId: string): Promise<TeamSyncEvidence> {
  const db = serverClient();

  const [ctxRes, brRes, injRes, decRes] = await Promise.all([
    db.from('context').select('*').eq('project_id', projectId)
      .order('id', { ascending: false }).limit(60),
    db.from('branches').select('branch, merged, reported_by, updated_at').eq('project_id', projectId),
    db.from('injections').select('context_id, member').eq('project_id', projectId).limit(500),
    db.from('decisions').select('id, question, resolved_choice, created_at')
      .eq('project_id', projectId).eq('status', 'resolved').limit(100),
  ]);

  const rows = (ctxRes.data ?? []) as ContextRow[];
  const branches = brRes.data ?? [];
  const injections = injRes.data ?? [];

  // 어떤 context 를 누가 주입받았는가 — 이 제품만 가진 사실
  const deliveredBy = new Map<number, string[]>();
  for (const i of injections) {
    const list = deliveredBy.get(i.context_id) ?? [];
    if (!list.includes(i.member)) list.push(i.member);
    deliveredBy.set(i.context_id, list);
  }

  const evidence: Evidence[] = [];
  const members = new Set<string>();

  // ── 세션 요약 = 작업 로그 ──────────────────────────────────────
  // "무엇을 했는가" 이지 "몇 건 중 몇 건" 이 아니다. 그래서 `WORK_LOG` 다.
  //
  // 예전에는 `TASK_STATUS` 였는데, 그러면 이슈트래커가 상태를 정확히 세어 줘도
  // 세션 요약이 "셀 수 없는 상태" 로 함께 세어져 해석 모호성이 늘 FAIL 이었다.
  // 없는 상태를 있다고 한 게 아니라, 상태가 아닌 것을 상태 자리에 놓은 쪽이었다.
  for (const r of rows.slice(0, 12)) {
    members.add(r.member);
    // 이 세션이 무엇에 관한 것인가 — 브랜치가 가장 정확한 대상 이름이다.
    // 요약 문장에서도 이슈키가 적혀 있으면 뽑는다. 없으면 뽑지 않는다.
    const scopeKeys = mergeScopeKeys(
      // 브랜치는 이름이 들어 있는 자리다. 요약문은 문장이라 이슈키만 뽑는다 —
      // 문장에 이름 규칙을 돌리면 `app/login/page.tsx` 같은 파일 경로가 대상으로 잡힌다.
      extractNameKeys(r.branch ?? ''),
      extractRefKeys(`${r.work_label ?? ''} ${r.summary ?? ''}`),
    );

    evidence.push({
      id: `ev-ctx-${r.id}`,
      source: 'teamsync',
      sourceRef: `context:${r.id}`,
      kind: 'WORK_LOG',
      summary: r.work_label ? `${r.work_label} — ${r.summary_plain ?? r.summary}` : (r.summary_plain ?? r.summary),
      observedAt: r.created_at,
      facts: { owner: r.member },
      scopeKeys,
    });

    // 아무도 못 받았어도 근거를 만든다. 빈 배열(아무도 못 받음)과
    // 근거 없음(알 수 없음)은 다른 값이고, 게이트가 그 둘을 다르게 읽어야 한다.
    const to = deliveredBy.get(r.id) ?? [];
    evidence.push({
      id: `ev-inj-${r.id}`,
      source: 'teamsync',
      sourceRef: `injections:context=${r.id}`,
      kind: 'DELIVERY',
      summary: to.length > 0
        ? `이 요약을 ${to.join(' · ')} 의 에이전트가 이미 주입받았습니다.`
        : '이 요약은 아직 아무에게도 주입되지 않았습니다.',
      observedAt: r.created_at,
      // 짝이 되는 세션 요약과 같은 대상·같은 소유자다. 그래야 요약이 붙는 자리에
      // 전달 기록도 같이 붙는다 — 둘이 따로 붙으면 "이미 전달됨" 이 반쪽만 보인다.
      facts: { deliveredTo: to, owner: r.member },
      scopeKeys,
    });
  }

  // ── 브랜치 = git 이 알려준 사실 ────────────────────────────────
  for (const b of branches) {
    if (BASE_BRANCHES.includes(b.branch)) continue;
    if (b.reported_by) members.add(b.reported_by);
    evidence.push({
      id: `ev-br-${b.branch}`,
      source: 'teamsync',
      sourceRef: `branches:${b.branch}`,
      kind: 'BRANCH_STATE',
      summary: `${b.branch} — ${b.merged ? '기준 브랜치에 병합됨' : '미병합'}`,
      observedAt: b.updated_at,
      facts: { merged: b.merged, owner: b.reported_by ?? undefined },
      scopeKeys: extractNameKeys(b.branch),
    });
  }

  // ── 이미 닫힌 결정 = 같은 질문을 두 번 묻지 않기 위한 근거 ─────
  for (const d of decRes.data ?? []) {
    if (!d.resolved_choice) continue;
    evidence.push({
      id: `ev-ans-${d.id}`,
      source: 'teamsync',
      sourceRef: `decisions:${d.id}`,
      kind: 'ANSWER',
      summary: `“${d.question}” — 이미 “${d.resolved_choice}” 로 답했습니다.`,
      observedAt: d.created_at,
      facts: { answeredChoice: d.resolved_choice },
    });
  }

  return { evidence, members: [...members] };
}
