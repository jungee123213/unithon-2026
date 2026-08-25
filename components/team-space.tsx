'use client';

import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import { CounterPanel } from './counter-panel';
import { PageHero } from './page-hero';
import { DashRule, Stencil } from './receipt-parts';
import { LiveBadge, useRealtime } from './realtime';
import { relativeTime } from '@/lib/injection';
import type { TeamSpaceData } from '@/lib/queries';

const spring = { type: 'spring' as const, stiffness: 260, damping: 30 };
const sessionCols = 'grid-cols-[64px_100px_1fr] gap-4 sm:grid-cols-[80px_130px_1fr_200px] sm:gap-8';

/** 모션 1/3 · 카드 흡수 — 세션 행은 "읽으세요"가 아니라 "흡수됐습니다"의 표시다 (§7.2, FR-5.5) */
function SessionRow({ card, index }: { card: TeamSpaceData['sessions'][number]; index: number }) {
  const absorbed = card.consumers.length > 0;
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: absorbed ? 0.7 : 1, y: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ ...spring, delay: Math.min(index * 0.04, 0.3) }}
      className={`grid items-baseline border-b border-[var(--rule-soft)] py-5 ${sessionCols}`}
    >
      <span className="tabular text-[16px] font-bold sm:text-[17px]">{card.member}</span>
      <span className="text-[14px] text-[var(--ink-faint)] sm:text-[15px]">
        {relativeTime(card.created_at)}{card.branch && <span className="tabular"> · {card.branch}</span>}
      </span>
      <span className="col-span-2 text-[16px] leading-relaxed sm:col-span-1 sm:text-[17px]">{card.summary}</span>
      <span className="col-span-3 flex flex-wrap items-center gap-1.5 sm:col-span-1">
        <AnimatePresence>
          {absorbed && (
            <motion.span
              initial={{ opacity: 0, scale: 0.86 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={spring}
              className="flex flex-wrap items-center gap-1.5"
            >
              <span className="stencil" style={{ color: 'var(--live)' }}>흡수됨</span>
              {card.consumers.map((m) => (
                <span key={m} className="tabular rounded-sm bg-[var(--highlight)] px-1.5 py-0.5 text-[12px] font-bold">
                  {m}
                </span>
              ))}
            </motion.span>
          )}
        </AnimatePresence>
        {!absorbed && <span className="text-[14px] text-[var(--ink-faint)]">대기</span>}
      </span>
    </motion.li>
  );
}

/** FR-5.1 · 주입된 문자열 자체를 화면에 보여준다. 대시보드가 아니라 영수증이다. */
function ReceiptSlip({ receipt, index }: { receipt: TeamSpaceData['receipts'][number]; index: number }) {
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 26 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -14 }}
      transition={{ ...spring, delay: Math.min(index * 0.05, 0.25) }}
    >
      <div className="roll px-6 py-6 sm:px-8">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <Stencil>수신 · {receipt.member}</Stencil>
          <span className="text-[15px] text-[var(--ink-faint)]">
            {relativeTime(receipt.injected_at)} · {receipt.items}건
          </span>
        </div>
        <DashRule className="my-4" />
        <pre className="overflow-x-auto whitespace-pre-wrap break-words font-[family-name:var(--font-receipt-mono)] text-[15px] leading-[1.75] text-[var(--ink)]">
{receipt.rendered}
        </pre>
      </div>
    </motion.li>
  );
}

export function TeamSpace({ projectId, data }: { projectId: string; data: TeamSpaceData }) {
  const connected = useRealtime(projectId);

  return (
    <div>
      <PageHero
        crumbs={[{ label: 'TeamSync' }, { label: '영수증' }]}
        title="영수증"
        subtitle="사람을 거치지 않고 도착한 것들의 기록. 아래는 동료의 에이전트에게 실제로 주입된 문자열 원문입니다."
        maxWidth={1280}
      />

      <div className="mx-auto w-full max-w-[1280px] px-5 py-10 sm:px-10">
        <div className="flex justify-end pb-2">
          <LiveBadge connected={connected} />
        </div>
        <div className="flex flex-wrap items-baseline justify-end gap-4 pb-3">
          <Link href={`/p/${projectId}/progress`} className="text-[16px] font-semibold text-[var(--accent)] hover:underline">
            진행사항 →
          </Link>
        </div>

        <section>
          <div className="flex flex-wrap items-baseline justify-between gap-4 border-b-2 border-[var(--ink)] pb-4">
            <h2 className="text-[24px] font-bold tracking-tight sm:text-[26px]">주입된 문자열</h2>
            <span className="text-[15px] font-medium text-[var(--ink-faint)]">
              {data.receipts.length}건 · 가공 없이 원문 그대로
            </span>
          </div>
          <div className="mt-6">
            {data.receipts.length === 0 ? (
              <p className="py-8 text-center text-[17px] text-[var(--ink-soft)]">
                아직 아무것도 주입되지 않았습니다.
                <br />
                <span className="text-[15px]">동료가 세션을 끝내면 여기에 영수증이 찍힙니다.</span>
              </p>
            ) : (
              <ul className="space-y-6">
                <AnimatePresence initial={false} mode="popLayout">
                  {data.receipts.map((r, i) => (
                    <ReceiptSlip key={r.batch_id} receipt={r} index={i} />
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </div>
        </section>

        <section className="mt-12">
          <div className="flex flex-wrap items-baseline justify-between gap-4 border-b-2 border-[var(--ink)] pb-4">
            <h2 className="text-[24px] font-bold tracking-tight sm:text-[26px]">세션 · 흡수 대상</h2>
            <span className="text-[15px] font-medium text-[var(--ink-faint)]">수집된 세션 {data.sessions.length}건</span>
          </div>
          <div className={`mt-4 hidden border-b border-[var(--rule)] pb-3.5 font-[family-name:var(--font-receipt-mono)] text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-faint)] sm:grid ${sessionCols}`}>
            <span>멤버</span><span>시각</span><span>요약</span><span>흡수</span>
          </div>
          {data.sessions.length === 0 ? (
            <p className="py-8 text-center text-[17px] text-[var(--ink-soft)]">아직 수집된 세션이 없습니다.</p>
          ) : (
            <ul className="mt-2">
              <AnimatePresence initial={false} mode="popLayout">
                {data.sessions.map((c, i) => (
                  <SessionRow key={c.id} card={c} index={i} />
                ))}
              </AnimatePresence>
            </ul>
          )}
        </section>

        <CounterPanel counters={data.counters} />
      </div>
    </div>
  );
}
