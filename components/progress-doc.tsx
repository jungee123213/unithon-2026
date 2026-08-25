'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { PageHero } from './page-hero';
import { Stencil } from './receipt-parts';
import { LiveBadge, useRealtime } from './realtime';
import { relativeTime } from '@/lib/injection';
import {
  groupByMember, HUMAN_WRITTEN_LINES, STATUS_BASIS, STATUS_LABEL,
  type BranchStatus, type MemberSection, type ProgressEntry, type ProgressSection,
} from '@/lib/progress';

const spring = { type: 'spring' as const, stiffness: 250, damping: 28 };

const STATUS_STYLE: Record<BranchStatus, { bg: string; fg: string; border: string }> = {
  active: { bg: 'var(--highlight)', fg: 'var(--ink)',       border: 'var(--ink)' },
  merged: { bg: 'transparent',      fg: 'var(--live)',      border: 'var(--live)' },
  idle:   { bg: 'transparent',      fg: 'var(--stamp)',     border: 'var(--stamp)' },
  base:   { bg: 'transparent',      fg: 'var(--ink-faint)', border: 'var(--rule)' },
};

function stamp(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function StatusBadge({ status, basis = true }: { status: BranchStatus; basis?: boolean }) {
  const st = STATUS_STYLE[status];
  return (
    <span className="inline-flex items-baseline gap-2">
      <span
        className="tabular rounded-sm border px-2 py-0.5 text-[13px] font-semibold uppercase tracking-wider"
        style={{ background: st.bg, color: st.fg, borderColor: st.border }}
      >
        {STATUS_LABEL[status]}
      </span>
      {/* 근거를 라벨 옆에 붙인다 — 추정이 아니라는 게 화면에서 보여야 한다 */}
      {basis && <span className="text-[14px] text-[var(--ink-faint)]">{STATUS_BASIS[status]}</span>}
    </span>
  );
}

function Summary({ e, showDev }: { e: ProgressEntry; showDev: boolean }) {
  return (
    <span className="text-[17px] leading-relaxed">
      {e.summaryPlain}
      {showDev && e.summary !== e.summaryPlain && (
        <span className="mt-1 block border-l-2 border-[var(--rule)] pl-3 font-[family-name:var(--font-receipt-mono)] text-[15px] leading-relaxed text-[var(--ink-soft)]">
          {e.summary}
        </span>
      )}
    </span>
  );
}

/* ══ 작업별 (브랜치 축) ═══════════════════════════════════════════ */

function BranchEntry({ e, index, showDev }: { e: ProgressEntry; index: number; showDev: boolean }) {
  return (
    <motion.li
      layout
      initial={{ opacity: 0, x: -14 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0 }}
      transition={{ ...spring, delay: Math.min(index * 0.03, 0.24) }}
      className="grid grid-cols-[auto_auto_1fr_auto] items-baseline gap-x-4 py-2.5"
    >
      <span className="tabular text-[14px] text-[var(--ink-faint)]">{stamp(e.created_at)}</span>
      <span className="tabular text-[14px] font-semibold">{e.member}</span>
      <Summary e={e} showDev={showDev} />
      {/* 줄마다 남기는 표시 — 이 줄은 사람이 친 게 아니다 */}
      <span className="stencil whitespace-nowrap" style={{ color: 'var(--live)' }}>auto</span>
    </motion.li>
  );
}

function BranchSection({ s, index, showDev }: { s: ProgressSection; index: number; showDev: boolean }) {
  return (
    <motion.section
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...spring, delay: Math.min(index * 0.06, 0.3) }}
      className="py-7"
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
        {/* 사람이 읽는 이름이 먼저, 브랜치명은 근거로 뒤에 */}
        <h2 className="text-[22px] font-bold leading-tight tracking-tight">
          {s.label ?? s.branch}
        </h2>
        {s.label && <span className="tabular text-[15px] text-[var(--ink-faint)]">{s.branch}</span>}
        <StatusBadge status={s.status} />
      </div>
      <div className="stencil mt-1">
        {s.members.join(' · ')} · {s.entries.length}건 · 최근 {relativeTime(s.lastAt)}
      </div>

      <ul className="mt-3 divide-y divide-dotted divide-[var(--rule)]">
        <AnimatePresence initial={false} mode="popLayout">
          {s.entries.map((e, i) => <BranchEntry key={e.id} e={e} index={i} showDev={showDev} />)}
        </AnimatePresence>
      </ul>
    </motion.section>
  );
}

/* ══ 사람별 (멤버 축) ═════════════════════════════════════════════ */

function MemberCard({ m, index, showDev }: { m: MemberSection; index: number; showDev: boolean }) {
  const byBranch = new Map(m.branches.map((b) => [b.branch, b]));
  const latest = m.entries[0];
  const latestBranch = byBranch.get(latest.branch);

  return (
    <motion.section
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...spring, delay: Math.min(index * 0.06, 0.3) }}
      className="py-7"
    >
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 className="tabular text-[26px] font-bold leading-none">{m.member}</h2>
        <span className="stencil">
          {m.total}건 · 작업 {m.branches.length}개 · 최근 {relativeTime(m.lastAt)}
        </span>
      </div>

      {/* 가장 최근 기록 — "지금 하는 일"이 아니라 "마지막으로 남긴 것". 아는 것만 쓴다. */}
      <div className="mt-4 rounded-sm border-l-[3px] border-[var(--ink)] bg-[color-mix(in_srgb,var(--highlight)_35%,transparent)] px-4 py-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <Stencil>가장 최근 기록</Stencil>
          <span className="text-[15px] font-semibold">{latestBranch?.label ?? latest.branch}</span>
          {latestBranch && <StatusBadge status={latestBranch.status} basis={false} />}
          <span className="stencil">{stamp(latest.created_at)}</span>
        </div>
        <div className="mt-1.5">
          <Summary e={latest} showDev={showDev} />
        </div>
      </div>

      <div className="mt-4">
        <Stencil>참여한 작업</Stencil>
        <ul className="mt-2 flex flex-wrap gap-2">
          {m.branches.map((b) => (
            <li
              key={b.branch}
              className="flex items-baseline gap-2 rounded-sm border border-[var(--rule)] px-2.5 py-1"
            >
              <span className="text-[15px] font-semibold">{b.label ?? b.branch}</span>
              <span className="tabular text-[13px] text-[var(--ink-faint)]">{b.count}건</span>
              <StatusBadge status={b.status} basis={false} />
            </li>
          ))}
        </ul>
      </div>

      {m.entries.length > 1 && (
        <div className="mt-4">
          <Stencil>남긴 기록</Stencil>
          <ul className="mt-1 divide-y divide-dotted divide-[var(--rule)]">
            {m.entries.slice(1).map((e) => (
              <li key={e.id} className="grid grid-cols-[auto_auto_1fr_auto] items-baseline gap-x-4 py-2.5">
                <span className="tabular text-[14px] text-[var(--ink-faint)]">{stamp(e.created_at)}</span>
                {/* 어느 작업의 기록인지 — 이게 없으면 비개발자는 맥락을 잃는다 */}
                <span className="whitespace-nowrap text-[14px] font-semibold text-[var(--ink-soft)]">
                  {byBranch.get(e.branch)?.label ?? e.branch}
                </span>
                <Summary e={e} showDev={showDev} />
                <span className="stencil whitespace-nowrap" style={{ color: 'var(--live)' }}>auto</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </motion.section>
  );
}

/* ══ 문서 ═════════════════════════════════════════════════════════ */

type Axis = 'branch' | 'member';

export function ProgressDoc({
  projectId, sections, preview = false,
}: { projectId: string; sections: ProgressSection[]; preview?: boolean }) {
  const connected = useRealtime(projectId);
  const [axis, setAxis] = useState<Axis>('branch');
  const [showDev, setShowDev] = useState(false);

  const members = groupByMember(sections);
  const total = sections.reduce((n, s) => n + s.entries.length, 0);
  const base = preview ? '/preview' : `/p/${projectId}`;

  return (
    <div>
      <PageHero
        crumbs={[{ label: 'TeamSync' }, { label: '진행사항' }]}
        backHref={base}
        backLabel="← 영수증으로 돌아가기"
        title="진행사항"
        subtitle={<><strong className="text-white">아무도 이 문서를 쓰지 않았습니다.</strong> 각자 CLI로 일하면 줄이 저절로 붙습니다.</>}
        maxWidth={1100}
      />

      <div className="mx-auto w-full max-w-[1100px] px-5 py-10 sm:px-10">
        <div className="flex justify-end pb-2">
          <LiveBadge connected={connected} />
        </div>

        <div className="grid gap-x-8 gap-y-5 border-t-2 border-[var(--ink)] border-b border-[var(--rule)] py-6 sm:grid-cols-3">
          <div>
            <div className="text-[15px] font-semibold text-[var(--ink-faint)]">문서</div>
            <p className="tabular mt-2 text-[19px] font-bold">{projectId} / 진행사항</p>
          </div>
          <div>
            <div className="text-[15px] font-semibold text-[var(--ink-faint)]">기록된 줄</div>
            <p className="tabular mt-2 text-[19px] font-bold">{total}</p>
          </div>
          <div>
            <div className="text-[15px] font-semibold text-[var(--ink-faint)]">사람이 쓴 줄</div>
            <p className="tabular mt-2 flex items-center gap-2 text-[19px] font-bold">
              {HUMAN_WRITTEN_LINES}
              <span className="stamp px-1.5 py-0.5 text-[10px] font-bold">no code path</span>
            </p>
          </div>
        </div>

        {/* 축 전환 — 같은 데이터를 다르게 묶을 뿐이다 */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-stretch rounded-sm border border-[var(--ink)]">
            {([['branch', '작업별'], ['member', '사람별']] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setAxis(key)}
                className="px-4 py-1.5 text-[15px] font-semibold transition-colors"
                style={
                  axis === key
                    ? { background: 'var(--ink)', color: '#ffffff' }
                    : { color: 'var(--ink-soft)' }
                }
              >
                {label}
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowDev((v) => !v)}
            className="rounded-sm border border-[var(--rule)] px-4 py-1.5 text-[15px] font-semibold text-[var(--ink)] transition-colors hover:border-[var(--ink)]"
          >
            {showDev ? '개발자 표현 숨기기' : '개발자 표현 같이 보기'}
          </button>
        </div>

        {total === 0 ? (
          <p className="py-14 text-center text-[18px] text-[var(--ink-soft)]">
            아직 기록된 작업이 없습니다.
            <br />
            <span className="text-[15px]">누군가 세션을 끝내면 여기에 줄이 붙습니다.</span>
          </p>
        ) : (
          <div className="divide-y divide-[var(--rule)]">
            {axis === 'branch'
              ? sections.map((s, i) => <BranchSection key={s.branch} s={s} index={i} showDev={showDev} />)
              : members.map((m, i) => <MemberCard key={m.member} m={m} index={i} showDev={showDev} />)}
          </div>
        )}
      </div>
    </div>
  );
}
