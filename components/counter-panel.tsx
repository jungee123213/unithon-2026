'use client';

import { AnimatePresence, motion } from 'motion/react';
import { formatDuration } from '@/lib/counters';
import type { Counters } from '@/lib/counters';

/** 모션 2/3 · 카운터 증가 — 숫자가 굴러 올라온다 (FR-5.5) */
function Rolling({ value }: { value: string }) {
  return (
    <span className="relative inline-block overflow-hidden align-bottom" style={{ minWidth: '1.4ch' }}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={{ y: '0.9em', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '-0.9em', opacity: 0 }}
          transition={{ type: 'spring', stiffness: 420, damping: 32 }}
          className="inline-block tabular"
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div className="text-[15px] font-semibold text-[var(--ink-faint)]">{label}</div>
      <div className="tabular mt-2.5 text-[32px] font-bold leading-none sm:text-[38px]" style={color ? { color } : undefined}>
        <Rolling value={value} />
      </div>
    </div>
  );
}

export function CounterPanel({ counters }: { counters: Counters }) {
  const { tier1 } = counters;

  return (
    <>
      <section className="mt-12">
        <h2 className="border-b-2 border-[var(--ink)] pb-4 text-[24px] font-bold tracking-tight sm:text-[26px]">합계</h2>
        <div className="grid grid-cols-1 gap-8 border-b border-[var(--rule-soft)] py-8 sm:grid-cols-3 sm:gap-0">
          <div className="sm:border-r sm:border-[var(--rule-soft)] sm:pr-8">
            <Stat label="전파된 컨텍스트" value={String(tier1.contexts)} />
          </div>
          <div className="sm:border-r sm:border-[var(--rule-soft)] sm:px-8">
            <Stat label="멤버 간 전파" value={String(tier1.crossMember)} />
          </div>
          <div className="sm:pl-8">
            <Stat label="생성 → 첫 소비 평균" value={formatDuration(tier1.avgSecondsToFirstUse)} />
          </div>
        </div>
        <p className="mt-4 text-[16px] text-[var(--ink-faint)]">
          전부 DB 행에서 계산한 값입니다. 추정치가 섞여 있지 않습니다.
        </p>
      </section>

      <section className="mt-12">
        <div className="rounded-sm border border-[var(--rule)] bg-[var(--card-tint)] px-6 py-8 sm:px-9">
          <div className="stencil">구조적 0</div>
          <div className="mt-5 grid gap-6 sm:grid-cols-2">
            <div className="flex items-baseline gap-4">
              <span className="text-[16px] font-semibold">사람이 옮긴 컨텍스트</span>
              <span aria-hidden className="flex-1 border-b border-dotted border-[var(--rule)] translate-y-[-4px]" />
              <span className="tabular text-[20px] font-bold">0</span>
            </div>
            <div className="flex items-baseline gap-4">
              <span className="text-[16px] font-semibold">사람이 편집한 진행상황</span>
              <span aria-hidden className="flex-1 border-b border-dotted border-[var(--rule)] translate-y-[-4px]" />
              <span className="tabular text-[20px] font-bold">0</span>
            </div>
          </div>
          <div className="mt-6 flex items-start gap-4">
            <span className="stamp shrink-0 px-2.5 py-1 text-[11px] font-bold">no code path</span>
            <p className="text-[16px] leading-relaxed text-[var(--ink-soft)]">
              이 값들은 <em className="not-italic font-semibold text-[var(--ink)]">아직 0</em>이 아니라,
              증가시킬 코드 경로가 존재하지 않아서 0입니다.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
