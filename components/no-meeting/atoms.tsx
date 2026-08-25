'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { GATE, OUTCOME, TYPE, clockLabel } from '@/lib/no-meeting/labels';
import type { Evidence, GateCheck, MeetingType, Outcome } from '@/lib/no-meeting/types';

/** 다섯 화면이 공유하는 조각들. 같은 판정을 어디서 보든 같은 모양이어야 한다. */

export const solidBtn =
  'inline-flex h-11 items-center justify-center rounded-sm border-0 bg-[var(--ink)] px-5 text-[15px] font-semibold text-white transition-colors hover:bg-[var(--accent)] disabled:cursor-not-allowed disabled:bg-[var(--placeholder)]';
export const outlineBtn =
  'inline-flex h-11 items-center justify-center rounded-sm border border-[var(--rule)] bg-white px-[18px] text-[15px] font-semibold text-[var(--ink)] transition-colors hover:border-[var(--ink)] disabled:cursor-not-allowed disabled:text-[var(--placeholder)]';

export function SectionHead({ children, count }: { children: ReactNode; count?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-4 border-b-2 border-[var(--ink)] pb-3">
      <h2 className="text-[22px] font-bold tracking-tight sm:text-[24px]">{children}</h2>
      {count !== undefined && <span className="tabular text-[14px] font-medium text-[var(--ink-faint)]">{count}</span>}
    </div>
  );
}

/** 판정 결과 도장. 이 제품에서 결론은 문장이 아니라 도장이다. */
export function VerdictStamp({
  outcome, size = 'md', drop = false,
}: { outcome: Outcome; size?: 'sm' | 'md' | 'lg'; drop?: boolean }) {
  const o = OUTCOME[outcome];
  const dim = {
    sm: 'px-2.5 py-1 text-[11px] border',
    md: 'px-4 py-1.5 text-[14px] border-2',
    lg: 'px-7 py-3 text-[24px] sm:text-[30px] border-[3px]',
  }[size];
  return (
    <span
      className={`inline-flex items-center gap-2.5 rounded-sm font-[family-name:var(--font-receipt-mono)] font-bold uppercase tracking-[0.16em] ${dim} ${drop ? 'verdict-drop' : ''}`}
      style={{ color: o.ink, borderColor: o.ink, transform: drop ? undefined : 'rotate(-1.5deg)' }}
    >
      {o.short}
      {size !== 'sm' && (
        <span className="font-[family-name:var(--font-receipt-kr)] text-[.62em] font-semibold normal-case tracking-normal opacity-80">
          {o.label}
        </span>
      )}
    </span>
  );
}

export function TypeChip({ type }: { type: MeetingType }) {
  const t = TYPE[type];
  return (
    <span className="inline-flex items-center gap-2 rounded-sm border border-[var(--rule)] bg-[var(--card-tint)] px-2.5 py-1">
      <span className="tabular text-[12px] font-bold text-[var(--ink)]">{t.code}</span>
      <span className="text-[13px] font-semibold text-[var(--ink-soft)]">{t.label}</span>
    </span>
  );
}

/** 게이트 한 줄 — 결과 · 기준 · 이번 값 · 근거. 넷이 다 있어야 설명이 된다. */
export function GateRow({
  gate, index, evidence,
}: { gate: GateCheck; index: number; evidence: Evidence[] }) {
  const g = GATE[gate.status];
  const refs = evidence.filter((e) => gate.evidenceIds.includes(e.id));

  return (
    <li
      className="rail-in grid grid-cols-[2.2rem_1.6rem_1fr] items-start gap-x-3 border-b border-[var(--rule-soft)] py-4 last:border-b-0"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <span className="tabular pt-0.5 text-[12px] font-semibold text-[var(--placeholder)]">
        {String(index + 1).padStart(2, '0')}
      </span>
      <span
        aria-label={g.label}
        className="tabular flex h-6 w-6 items-center justify-center rounded-sm border text-[14px] font-bold leading-none"
        style={{ color: g.ink, borderColor: g.ink }}
      >
        {g.mark}
      </span>

      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className={`text-[17px] font-bold ${gate.status === 'NOT_APPLICABLE' ? 'text-[var(--placeholder)]' : ''}`}>
            {gate.label}
          </span>
          <span className="stencil !text-[10px]" style={{ color: g.ink }}>{g.label}</span>
        </div>

        <p className="mt-1 text-[15px] leading-snug text-[var(--ink-soft)]">{gate.reason}</p>
        <p className="mt-1 text-[13.5px] leading-snug text-[var(--placeholder)]">기준 · {gate.ruleText}</p>

        {refs.length > 0 && (
          <ul className="mt-2 space-y-1">
            {refs.map((e) => <EvidenceLine key={e.id} e={e} />)}
          </ul>
        )}

        {gate.ifResolved && (
          <p
            className="mt-2.5 border-l-2 py-1 pl-3 text-[14.5px] leading-snug"
            style={{ borderColor: g.ink, color: 'var(--ink-soft)' }}
          >
            {gate.ifResolved}
          </p>
        )}
      </div>
    </li>
  );
}

/**
 * 근거 한 줄.
 *
 * 기한이 지났는지를 여기서 계산하지 않는다 — 최신성은 판정 시각에 파생 계층이
 * 이미 판단했고, 그 결과는 `data_fresh` 게이트에 있다. 화면이 다시 계산하면
 * 과거 판정을 열 때마다 근거가 달라 보인다.
 */
export function EvidenceLine({ e }: { e: Evidence }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 text-[13.5px] text-[var(--ink-faint)]">
      <span className="tabular rounded-sm bg-[var(--card-tint)] px-1.5 py-0.5 text-[11.5px] font-semibold text-[var(--ink-soft)]">
        {e.sourceRef}
      </span>
      <span className="min-w-0 flex-1">{e.summary}</span>
      <span className="tabular text-[12px] text-[var(--placeholder)]">
        {clockLabel(e.observedAt)}
      </span>
    </li>
  );
}

/** 좌우로 벌어진 한 줄 — 기존 영수증 화면의 Line 과 같은 리듬. */
export function DotLine({ label, value, strong = false }: { label: ReactNode; value: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-baseline gap-3 py-1.5">
      <span className={strong ? 'font-semibold' : 'text-[var(--ink-soft)]'}>{label}</span>
      <span aria-hidden className="flex-1 translate-y-[-.25em] border-b border-dotted border-[var(--rule)]" />
      <span className={`tabular ${strong ? 'font-bold' : ''}`}>{value}</span>
    </div>
  );
}

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 border-b border-[var(--rule)] pb-0.5 text-[14px] font-semibold text-[var(--ink-faint)] transition-colors hover:border-[var(--ink)] hover:text-[var(--ink)] hover:no-underline"
    >
      {children}
    </Link>
  );
}
