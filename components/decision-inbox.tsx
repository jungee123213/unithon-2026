'use client';

import Link from 'next/link';
import { useTransition } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { DashRule, Roll, Stencil, Tear } from './receipt-parts';
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
      initial={{ opacity: 0, y: -34, scale: 1.06, rotate: -1.5 }}
      animate={{ opacity: resolved ? 0.55 : 1, y: 0, scale: 1, rotate: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={spring}
    >
      <Tear up />
      <div className="roll px-6 py-6 sm:px-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <Stencil>사람 판단 필요</Stencil>
          <span className="stencil">{relativeTime(d.created_at)}</span>
        </div>

        <h2 className="mt-2 text-[22px] font-semibold leading-snug sm:text-[24px]">
          {d.question}
        </h2>

        <DashRule className="my-5" />

        <div className="grid gap-3 sm:grid-cols-2">
          {(d.options ?? []).map((o) => {
            const chosen = resolved && d.resolved_choice === o.label;
            return (
              <button
                key={o.label}
                disabled={resolved || pending}
                onClick={() => start(() => { void resolveDecision(projectId, d.id, o.label); })}
                className="group relative rounded-sm border-2 border-[var(--ink)] px-4 py-3.5 text-left transition-all
                           enabled:hover:-translate-y-0.5 enabled:hover:border-[var(--stamp)]
                           enabled:hover:shadow-[0_6px_0_-2px_var(--ink)] disabled:cursor-default"
                style={chosen ? { borderColor: 'var(--stamp)', background: 'var(--highlight)' } : undefined}
              >
                <span className="block text-[18px] font-semibold leading-snug">{o.label}</span>
                <span className="mt-1 block text-[15px] leading-snug text-[var(--ink-soft)]">
                  {o.rationale}
                </span>
                {chosen && (
                  <span className="stamp absolute -right-2 -top-3 rotate-[-8deg] bg-[var(--paper-lit)] px-2 py-0.5 text-[11px] font-bold">
                    선택됨
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {resolved && !d.resolved_choice && (
          <p className="mt-4 stencil">처리됨</p>
        )}
      </div>
      <Tear />
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
    <div className="mx-auto w-full max-w-[900px] px-5 py-8 sm:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4 pb-7">
        <div>
          <Link href={`/p/${projectId}`} className="stencil hover:text-[var(--ink)]">
            ← team space
          </Link>
          <h1 className="mt-1 font-[family-name:var(--font-receipt-mono)] text-[32px] font-bold uppercase leading-none tracking-[0.12em] sm:text-[40px]">
            Decision Inbox
          </h1>
          <p className="mt-2 text-[17px] text-[var(--ink-soft)]">
            보고하지 않는다. 읽지 않는다. <span className="font-semibold text-[var(--ink)]">결정만 한다.</span>
          </p>
        </div>
        <LiveBadge connected={connected} />
      </header>

      {open.length === 0 ? (
        /* §7.2 · 기본 상태는 비어 있음. 그게 정상이고, 그게 주장이다. */
        <Roll>
          <div className="flex flex-col items-center gap-4 py-12 text-center">
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
        </Roll>
      ) : (
        <ul className="space-y-7">
          <AnimatePresence initial={false} mode="popLayout">
            {open.map((d) => <DecisionCard key={d.id} d={d} projectId={projectId} />)}
          </AnimatePresence>
        </ul>
      )}

      {done.length > 0 && (
        <section className="mt-12">
          <Stencil className="pb-3">처리됨 · {done.length}</Stencil>
          <ul className="space-y-7">
            {done.map((d) => <DecisionCard key={d.id} d={d} projectId={projectId} />)}
          </ul>
        </section>
      )}
    </div>
  );
}
