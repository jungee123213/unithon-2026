'use client';

import { AnimatePresence, motion } from 'motion/react';
import { DashRule, Line, Roll, Stencil } from './receipt-parts';
import { formatDuration } from '@/lib/counters';
import type { Counters } from '@/lib/counters';

/** 모션 2/3 · 카운터 증가 — 숫자가 영수증 위로 굴러 올라온다 (FR-5.5) */
function Rolling({ value }: { value: string }) {
  return (
    <span className="relative inline-block overflow-hidden align-bottom" style={{ minWidth: '2ch' }}>
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

export function CounterPanel({ counters }: { counters: Counters }) {
  const { tier1 } = counters;

  return (
    <Roll>
      <Stencil>합계 · tier 1 — 실측</Stencil>
      <p className="mt-1 text-[15px] leading-snug text-[var(--ink-soft)]">
        전부 DB 행에서 계산한 값입니다. 추정치가 섞여 있지 않습니다.
      </p>

      <div className="mt-4">
        <Line label="전파된 컨텍스트" value={<Rolling value={String(tier1.contexts)} />} />
        <Line label="멤버 간 전파" value={<Rolling value={String(tier1.crossMember)} />} />
        <Line
          label="생성 → 첫 소비 평균"
          value={<Rolling value={formatDuration(tier1.avgSecondsToFirstUse)} />}
        />
      </div>

      <DashRule className="my-5" />

      <Stencil>합계 · tier 2 — 구조적 0</Stencil>
      <div className="mt-3">
        <Line label="사람이 옮긴 컨텍스트" value="0" strong />
        <Line label="사람이 편집한 진행상황" value="0" strong />
      </div>

      <div className="mt-4 flex items-start gap-3">
        <span className="stamp shrink-0 px-2.5 py-1 text-[11px] font-semibold">no code path</span>
        <p className="text-[15px] leading-snug text-[var(--ink-soft)]">
          이 값들은 <em className="not-italic font-semibold text-[var(--ink)]">아직 0</em>이 아니라,
          증가시킬 코드 경로가 존재하지 않아서 0입니다.
        </p>
      </div>
    </Roll>
  );
}
