'use client';

import { useTransition } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { PageHero } from './page-hero';
import { LiveBadge, useRealtime } from './realtime';
import { relativeTime } from '@/lib/injection';
import { resolveDecision } from '@/app/p/[projectId]/inbox/actions';
import type { DecisionRow } from '@/lib/types';

const spring = { type: 'spring' as const, stiffness: 240, damping: 26 };

/** 모션 3/3 · 결정 착지 — 카드가 도장처럼 내려앉는다 (FR-5.5) */
function DecisionCard({ d, projectId }: { d: DecisionRow; projectId: string }) {
  const [pending, start] = useTransition();
  const resolved = d.status === 'resolved';

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: -34, scale: 1.04 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={spring}
    >
      <div
        className={
          resolved
            ? 'rounded-sm border border-[var(--rule-soft)] bg-[var(--card-tint)] px-6 py-7 sm:px-9'
            : 'rounded-sm border border-[var(--rule)] border-t-[3px] border-t-[var(--stamp)] px-6 py-7 shadow-[0_1px_3px_rgba(20,22,26,.06)] sm:px-9'
        }
      >
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <span
            className="font-[family-name:var(--font-receipt-mono)] text-[12px] font-semibold uppercase tracking-[0.16em]"
            style={{ color: resolved ? 'var(--ink-faint)' : 'var(--stamp)' }}
          >
            {resolved ? '처리됨' : '사람 판단 필요'}
          </span>
          <span className="text-[15px] text-[var(--ink-faint)]">{relativeTime(d.created_at)}</span>
        </div>

        <h2 className={`mt-3.5 leading-snug font-bold ${resolved ? 'text-[20px] sm:text-[22px]' : 'text-[22px] sm:text-[24px]'}`}>
          {d.question}
        </h2>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {(d.options ?? []).map((o) => {
            const chosen = resolved && d.resolved_choice === o.label;
            if (resolved) {
              return (
                <div
                  key={o.label}
                  className={
                    chosen
                      ? 'relative rounded-sm border-2 border-[var(--stamp)] bg-[var(--highlight)] px-5 py-4'
                      : 'rounded-sm border border-[var(--input-border)] bg-white px-5 py-4'
                  }
                >
                  <span className={`block text-[18px] font-bold leading-snug ${chosen ? 'text-[var(--ink)]' : 'text-[var(--ink-soft)]'}`}>
                    {o.label}
                  </span>
                  <span className="mt-1.5 block text-[15px] leading-snug text-[var(--ink-soft)]">{o.rationale}</span>
                  {chosen && (
                    <span className="stamp absolute -right-2 -top-3 rotate-[-6deg] bg-white px-2 py-0.5 text-[11px] font-bold">
                      선택됨
                    </span>
                  )}
                </div>
              );
            }
            return (
              <button
                key={o.label}
                disabled={pending}
                onClick={() => start(() => { void resolveDecision(projectId, d.id, o.label); })}
                className="group rounded-sm border-2 border-[var(--ink)] bg-white px-5 py-4 text-left transition-colors enabled:hover:border-[var(--accent)] enabled:hover:bg-[#f5f8ff] disabled:cursor-default"
              >
                <span className="block text-[19px] font-bold leading-snug">{o.label}</span>
                <span className="mt-1.5 block text-[16px] leading-snug text-[var(--ink-soft)]">{o.rationale}</span>
              </button>
            );
          })}
        </div>
      </div>
    </motion.li>
  );
}

export function DecisionInbox({
  projectId, decisions,
}: { projectId: string; decisions: DecisionRow[] }) {
  const connected = useRealtime(projectId);
  const open = decisions.filter((d) => d.status === 'open');
  const done = decisions.filter((d) => d.status !== 'open');

  return (
    <div>
      <PageHero
        crumbs={[{ label: 'TeamSync' }, { label: '결정 인박스' }]}
        backHref={`/p/${projectId}`}
        backLabel="← 영수증으로 돌아가기"
        title="결정 인박스"
        subtitle={<>보고하지 않는다. 읽지 않는다. <strong className="text-white">결정만 한다.</strong></>}
        maxWidth={1000}
      />

      <div className="mx-auto w-full max-w-[1000px] px-5 py-10 sm:px-10">
        <div className="flex justify-end pb-2">
          <LiveBadge connected={connected} />
        </div>

        <div className="flex flex-wrap items-baseline justify-between gap-4 border-b-2 border-[var(--ink)] pb-4">
          <h2 className="text-[24px] font-bold tracking-tight sm:text-[26px]">사람 판단 필요</h2>
          <span className="text-[15px] font-medium text-[var(--ink-faint)]">{open.length}건</span>
        </div>

        {open.length === 0 ? (
          /* §7.2 · 기본 상태는 비어 있음. 그게 정상이고, 그게 주장이다. */
          <div className="flex flex-col items-center gap-4 py-14 text-center">
            <span className="stamp px-4 py-1.5 text-[13px] font-bold">nothing to decide</span>
            <p className="text-[19px] leading-relaxed">
              올라온 결정이 없습니다.
              <br />
              <span className="text-[16px] text-[var(--ink-soft)]">
                사실 확인 · 정책 확인 · 계산은 이미 답이 있어서 여기 오지 않습니다.
                <br />
                가치판단만 여기 올라옵니다.
              </span>
            </p>
          </div>
        ) : (
          <ul className="mt-6 space-y-7">
            <AnimatePresence initial={false} mode="popLayout">
              {open.map((d) => <DecisionCard key={d.id} d={d} projectId={projectId} />)}
            </AnimatePresence>
          </ul>
        )}

        {done.length > 0 && (
          <section className="mt-14">
            <div className="flex items-baseline justify-between gap-4 border-b border-[var(--rule)] pb-3">
              <h2 className="text-[20px] font-bold text-[var(--ink-soft)]">처리됨</h2>
              <span className="text-[15px] font-medium text-[var(--ink-faint)]">{done.length}건</span>
            </div>
            <ul className="mt-6 space-y-7">
              {done.map((d) => <DecisionCard key={d.id} d={d} projectId={projectId} />)}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
