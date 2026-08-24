import type { ContextRow } from './types';

/**
 * 진행사항 문서 — 비개발자가 개발자들의 작업현황을 보는 화면.
 *
 * 두 가지를 하지 않는다 (설계 문서 §4 W · §12):
 *   - 작업을 쪼개지 않는다. 묶는 축은 branch — 실제 데이터에 있는 것뿐이다.
 *   - 진행률을 추정하지 않는다. 상태는 git 머지 여부라는 사실에서만 나온다.
 */
export type ProgressEntry = {
  id: number;
  member: string;
  branch: string;
  summary: string;          // 에이전트용 원문 (개발자 표현 보기)
  summaryPlain: string;     // 비개발자용
  created_at: string;
};

/** 상태는 전부 사실에서 나온다. 추정한 값이 하나도 없다. */
export type BranchStatus =
  | 'base'      // 기준 브랜치 자체 (main·develop)
  | 'merged'    // git 상 기준 브랜치에 머지됨 = 끝남
  | 'active'    // 머지 안 됨 + 최근 활동 있음
  | 'idle';     // 머지 안 됨 + 활동 끊김

export type ProgressSection = {
  branch: string;
  /** 이 브랜치에서 하는 일 한 줄. 요약 LLM 이 붙인 이름 — 사실이 아니라 명명이다. */
  label: string | null;
  status: BranchStatus;
  entries: ProgressEntry[];   // 시간순 (오래된 것 → 최근)
  members: string[];
  firstAt: string;
  lastAt: string;
};

/** 활동이 끊겼다고 볼 시간. 값 자체가 판단이므로 화면에 그대로 표기한다. */
export const IDLE_AFTER_HOURS = 24;

const BASE_BRANCHES = ['main', 'master', 'develop'];

export type BranchFacts = {
  /** git branch --merged 로 확인된, 기준 브랜치에 들어간 브랜치들 */
  merged: string[];
};

export function groupProgress(
  rows: ContextRow[],
  facts: BranchFacts = { merged: [] },
  now: Date = new Date(),
): ProgressSection[] {
  const byBranch = new Map<string, ProgressEntry[]>();

  for (const r of rows) {
    const branch = r.branch || '(브랜치 없음)';
    const list = byBranch.get(branch) ?? [];
    list.push({
      id: r.id, member: r.member, branch,
      summary: r.summary,
      summaryPlain: r.summary_plain || r.summary,   // 없으면 원문으로 폴백
      created_at: r.created_at,
    });
    byBranch.set(branch, list);
  }

  const sections: ProgressSection[] = [];
  for (const [branch, entries] of byBranch) {
    entries.sort((a, b) => a.created_at.localeCompare(b.created_at));
    const members: string[] = [];
    for (const e of entries) if (!members.includes(e.member)) members.push(e.member);
    const lastAt = entries[entries.length - 1].created_at;

    let status: BranchStatus;
    if (BASE_BRANCHES.includes(branch)) {
      status = 'base';
    } else if (facts.merged.includes(branch)) {
      status = 'merged';
    } else {
      const hours = (now.getTime() - new Date(lastAt).getTime()) / 3_600_000;
      status = hours > IDLE_AFTER_HOURS ? 'idle' : 'active';
    }

    // 가장 최근 세션이 붙인 이름을 쓴다 — 작업 성격이 바뀌면 이름도 따라간다
    const labelled = rows
      .filter((r) => (r.branch || '(브랜치 없음)') === branch && r.work_label)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    const label = labelled.length ? labelled[0].work_label : null;

    sections.push({ branch, label, status, entries, members, firstAt: entries[0].created_at, lastAt });
  }

  // 진행중인 것부터, 그 안에서 최근 움직인 순
  const rank: Record<BranchStatus, number> = { active: 0, base: 1, idle: 2, merged: 3 };
  return sections.sort(
    (a, b) => rank[a.status] - rank[b.status] || b.lastAt.localeCompare(a.lastAt),
  );
}

export const STATUS_LABEL: Record<BranchStatus, string> = {
  base: '기준 브랜치',
  merged: '머지됨',
  active: '진행중',
  idle: '멈춤',
};

/** 라벨 옆에 근거를 같이 적는다 — "그 상태 어떻게 아셨어요?" 에 화면이 스스로 답해야 한다. */
export const STATUS_BASIS: Record<BranchStatus, string> = {
  base: '작업이 모이는 곳',
  merged: 'git 상 기준 브랜치에 들어감',
  active: '머지 전 · 최근 작업 있음',
  idle: `머지 전 · ${IDLE_AFTER_HOURS}시간 넘게 작업 없음`,
};

/** 이 문서에서 사람이 직접 쓴 줄의 수. 증가시킬 코드 경로가 없다 (§5.4 티어 2). */
export const HUMAN_WRITTEN_LINES = 0;

// ── 사람별 축 ─────────────────────────────────────────────────────
// 같은 데이터를 멤버로 다시 묶는다. 새로 만들어내는 값은 없다.
// 특히 "얼마나 했는가"는 세지 않는다 — 셀 수 있는 건 "무엇을 남겼는가" 뿐이다.

export type MemberBranch = {
  branch: string;
  label: string | null;
  status: BranchStatus;
  count: number;
  lastAt: string;
};

export type MemberSection = {
  member: string;
  entries: ProgressEntry[];     // 최근 순
  branches: MemberBranch[];     // 최근 순
  total: number;
  lastAt: string;
};

export function groupByMember(sections: ProgressSection[]): MemberSection[] {
  const byMember = new Map<string, ProgressEntry[]>();
  const meta = new Map<string, { label: string | null; status: BranchStatus }>();

  for (const s of sections) {
    meta.set(s.branch, { label: s.label, status: s.status });
    for (const e of s.entries) {
      const list = byMember.get(e.member) ?? [];
      list.push(e);
      byMember.set(e.member, list);
    }
  }

  const out: MemberSection[] = [];
  for (const [member, entries] of byMember) {
    entries.sort((a, b) => b.created_at.localeCompare(a.created_at));

    const byBranch = new Map<string, MemberBranch>();
    for (const e of entries) {
      const prev = byBranch.get(e.branch);
      if (prev) { prev.count += 1; continue; }
      const m = meta.get(e.branch);
      byBranch.set(e.branch, {
        branch: e.branch,
        label: m?.label ?? null,
        status: m?.status ?? 'active',
        count: 1,
        lastAt: e.created_at,      // entries 가 최근 순이라 첫 등장이 최신이다
      });
    }

    out.push({
      member,
      entries,
      branches: [...byBranch.values()].sort((a, b) => b.lastAt.localeCompare(a.lastAt)),
      total: entries.length,
      lastAt: entries[0].created_at,
    });
  }

  return out.sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}
