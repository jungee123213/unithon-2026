'use client';

import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import { CounterPanel } from './counter-panel';
import { DashRule, Roll, Stencil, Tear } from './receipt-parts';
import { LiveBadge, useRealtime } from './realtime';
import { relativeTime } from '@/lib/injection';
import type { TeamSpaceData } from '@/lib/queries';

const spring = { type: 'spring' as const, stiffness: 260, damping: 30 };

/** 모션 1/3 · 카드 흡수 — 세션 카드는 "읽으세요"가 아니라 "흡수됐습니다"의 표시다 (§7.2, FR-5.5) */
function SessionCard({ card, index }: { card: TeamSpaceData['sessions'][number]; index: number }) {
  const absorbed = card.consumers.length > 0;
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 18, filter: 'blur(3px)' }}
      animate={{ opacity: absorbed ? 0.62 : 1, y: 0, filter: 'blur(0px)' }}
      exit={{ opacity: 0, x: 28, filter: 'blur(4px)' }}
      transition={{ ...spring, delay: Math.min(index * 0.04, 0.3) }}
      className="relative py-4"
    >
      <div className="flex items-baseline gap-3">
        <span className="tabular text-[13px] font-semibold tracking-wider text-[var(--ink)]">
          {card.member}
        </span>
        <span className="stencil">{relativeTime(card.created_at)}</span>
        {card.branch && (
          <span className="tabular text-[12px] text-[var(--ink-faint)]">{card.branch}</span>
        )}
      </div>

      <p className="mt-1.5 text-[17px] leading-relaxed">{card.summary}</p>

      <div className="mt-2 h-[1.4em]">
        <AnimatePresence>
          {absorbed && (
            <motion.div
              initial={{ opacity: 0, scale: 0.86, x: -10 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              transition={spring}
              className="flex items-center gap-2"
            >
              <span className="stencil" style={{ color: 'var(--live)' }}>
                흡수됨 →
              </span>
              {card.consumers.map((m) => (
                <span
                  key={m}
                  className="tabular rounded-sm px-1.5 py-0.5 text-[12px] font-semibold"
                  style={{ background: 'var(--highlight)' }}
                >
                  {m}
                </span>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <DashRule className="absolute inset-x-0 bottom-0" />
    </motion.li>
  );
}

/** FR-5.1 · 주입된 문자열 자체를 화면에 보여준다. 대시보드가 아니라 영수증이다. */
function ReceiptSlip({ receipt, index }: { receipt: TeamSpaceData['receipts'][number]; index: number }) {
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 26, rotate: -0.8 }}
      animate={{ opacity: 1, y: 0, rotate: 0 }}
      exit={{ opacity: 0, y: -14 }}
      transition={{ ...spring, delay: Math.min(index * 0.05, 0.25) }}
    >
      <Tear up />
      <div className="roll px-6 py-5 sm:px-7">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <Stencil>수신 · {receipt.member}</Stencil>
          <span className="stencil">
            {relativeTime(receipt.injected_at)} · {receipt.items}건
          </span>
        </div>
        <DashRule className="my-3" />
        <pre className="overflow-x-auto whitespace-pre-wrap break-words font-[family-name:var(--font-receipt-mono)] text-[16px] leading-[1.7] text-[var(--ink)]">
{receipt.rendered}
        </pre>
      </div>
      <Tear />
    </motion.li>
  );
}

export function TeamSpace({ projectId, data }: { projectId: string; data: TeamSpaceData }) {
  const connected = useRealtime(projectId);

  return (
    <div className="mx-auto w-full max-w-[1400px] px-5 py-8 sm:px-8">
      {/* ── 머리글 ── */}
      <header className="flex flex-wrap items-end justify-between gap-4 pb-6">
        <div>
          <h1 className="font-[family-name:var(--font-receipt-mono)] text-[34px] font-bold uppercase leading-none tracking-[0.14em] sm:text-[42px]">
            TeamSync
          </h1>
          <p className="mt-2 text-[17px] text-[var(--ink-soft)]">
            사람을 거치지 않고 도착한 것들의 기록 ·{' '}
            <span className="tabular font-semibold text-[var(--ink)]">{projectId}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-5">
          <LiveBadge connected={connected} />
          <Link
            href={`/p/${projectId}/progress`}
            className="border-b-2 border-[var(--ink)] pb-0.5 text-[17px] font-semibold transition-colors hover:border-[var(--stamp)] hover:text-[var(--stamp)]"
          >
            진행사항
          </Link>
          <Link
            href={`/p/${projectId}/inbox`}
            className="group flex items-baseline gap-2.5 border-b-2 border-[var(--ink)] pb-0.5 text-[17px] font-semibold transition-colors hover:text-[var(--stamp)] hover:border-[var(--stamp)]"
          >
            결정 인박스
            <span
              className="tabular rounded-sm px-1.5 text-[14px] font-bold"
              style={{
                background: data.openDecisions ? 'var(--stamp)' : 'transparent',
                color: data.openDecisions ? '#fff' : 'var(--ink-faint)',
              }}
            >
              {data.openDecisions}
            </span>
          </Link>
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-12">
        {/* ── 영수증 (주인공) ── */}
        <section className="lg:col-span-7">
          <Stencil className="pb-3">영수증 · 실제로 주입된 문자열</Stencil>
          {data.receipts.length === 0 ? (
            <Roll>
              <p className="py-6 text-center text-[17px] text-[var(--ink-soft)]">
                아직 아무것도 주입되지 않았습니다.
                <br />
                <span className="text-[15px]">동료가 세션을 끝내면 여기에 영수증이 찍힙니다.</span>
              </p>
            </Roll>
          ) : (
            <ul className="space-y-6">
              <AnimatePresence initial={false} mode="popLayout">
                {data.receipts.map((r, i) => (
                  <ReceiptSlip key={r.batch_id} receipt={r} index={i} />
                ))}
              </AnimatePresence>
            </ul>
          )}
        </section>

        {/* ── 합계 + 세션 카드 ── */}
        <aside className="space-y-8 lg:col-span-5">
          <CounterPanel counters={data.counters} />

          <div>
            <Stencil className="pb-3">세션 · 흡수 대상</Stencil>
            <Roll>
              {data.sessions.length === 0 ? (
                <p className="py-4 text-center text-[17px] text-[var(--ink-soft)]">
                  아직 수집된 세션이 없습니다.
                </p>
              ) : (
                <ul className="-my-4">
                  <AnimatePresence initial={false} mode="popLayout">
                    {data.sessions.map((c, i) => (
                      <SessionCard key={c.id} card={c} index={i} />
                    ))}
                  </AnimatePresence>
                </ul>
              )}
            </Roll>
          </div>
        </aside>
      </div>
    </div>
  );
}
