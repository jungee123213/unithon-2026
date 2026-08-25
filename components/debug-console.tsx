'use client';

import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import { DashRule, Roll, Stencil } from './receipt-parts';
import { LiveBadge, useRealtime } from './realtime';

export type IngestEvent = {
  id: number;
  member: string | null;
  session_id: string | null;
  branch: string | null;
  turn_count: number | null;
  total_chars: number | null;
  outcome: string;
  reason: string | null;
  context_id: number | null;
  decisions: number;
  duration_ms: number | null;
  created_at: string;
};

/** 결과별 색. 버려진 이유가 잘 보여야 한다 — 그게 이 화면의 목적이다. */
const OUTCOME: Record<string, { label: string; fg: string; border: string; bg: string }> = {
  created:  { label: '생성됨',   fg: 'var(--live)',      border: 'var(--live)',      bg: 'transparent' },
  skipped:  { label: '건너뜀',   fg: 'var(--ink-soft)',  border: 'var(--rule)',      bg: 'transparent' },
  rejected: { label: '거부됨',   fg: 'var(--stamp)',     border: 'var(--stamp)',     bg: 'transparent' },
  error:    { label: '오류',     fg: '#fff',             border: 'var(--stamp)',     bg: 'var(--stamp)' },
};

const REASON: Record<string, string> = {
  not_team_relevant: 'L3 · 팀에 영향 없다고 판정',
  too_short: 'EX-6 · 누적 300자 미만',
  duplicate: '같은 세션이 이미 저장됨 (멱등키)',
  empty: '누적된 턴이 없음',
  unauthorized: '토큰이 유효하지 않음',
};

function stamp(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function Row({ e }: { e: IngestEvent }) {
  const o = OUTCOME[e.outcome] ?? OUTCOME.skipped;
  return (
    <motion.li
      layout
      initial={{ opacity: 0, x: -12, backgroundColor: 'var(--highlight)' }}
      animate={{ opacity: 1, x: 0, backgroundColor: 'rgba(0,0,0,0)' }}
      transition={{ type: 'spring', stiffness: 260, damping: 28, backgroundColor: { duration: 2.2 } }}
      className="py-3"
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="tabular text-[14px] text-[var(--ink-faint)]">{stamp(e.created_at)}</span>
        <span
          className="tabular rounded-sm border px-1.5 py-0.5 text-[12px] font-semibold uppercase tracking-wider"
          style={{ color: o.fg, borderColor: o.border, background: o.bg }}
        >
          {o.label}
        </span>
        <span className="text-[16px] font-semibold">{e.member ?? '—'}</span>
        {e.branch && <span className="tabular text-[14px] text-[var(--ink-faint)]">{e.branch}</span>}
        <span className="flex-1" />
        <span className="tabular text-[13px] text-[var(--ink-faint)]">
          {e.turn_count ?? 0}턴 · {e.total_chars ?? 0}자
          {e.duration_ms != null && ` · ${(e.duration_ms / 1000).toFixed(1)}s`}
        </span>
      </div>

      <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[15px]">
        {e.reason && (
          <span style={{ color: e.outcome === 'created' ? 'var(--ink-soft)' : o.fg }}>
            {REASON[e.reason] ?? e.reason}
          </span>
        )}
        {e.context_id != null && e.outcome === 'created' && (
          <span className="text-[var(--ink-soft)]">context #{e.context_id}</span>
        )}
        {e.decisions > 0 && (
          <span className="tabular rounded-sm px-1.5 text-[13px] font-semibold" style={{ background: 'var(--highlight)' }}>
            결정 {e.decisions}건
          </span>
        )}
        {e.session_id && (
          <span className="tabular text-[13px] text-[var(--ink-faint)]">{e.session_id.slice(0, 8)}</span>
        )}
      </div>
    </motion.li>
  );
}

export function DebugConsole({
  projectId, events,
}: { projectId: string; events: IngestEvent[] }) {
  const connected = useRealtime(projectId);
  const created = events.filter((e) => e.outcome === 'created').length;
  const skipped = events.filter((e) => e.outcome === 'skipped').length;
  const failed = events.filter((e) => e.outcome === 'rejected' || e.outcome === 'error').length;

  return (
    <div className="mx-auto w-full max-w-[1000px] px-5 py-8 sm:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4 pb-6">
        <div>
          <Link href={`/p/${projectId}`} className="stencil hover:text-[var(--ink)]">← team space</Link>
          <h1 className="mt-1 font-[family-name:var(--font-receipt-mono)] text-[30px] font-bold uppercase leading-none tracking-[0.12em]">
            디버그
          </h1>
          <p className="mt-2 text-[17px] text-[var(--ink-soft)]">
            에이전트 세션이 끝났을 때 무엇이 도착했고{' '}
            <span className="font-semibold text-[var(--ink)]">왜 버려졌는지</span> 보여줍니다.
          </p>
        </div>
        <LiveBadge connected={connected} />
      </header>

      <Roll>
        <div className="grid grid-cols-3 gap-4">
          {[['생성됨', created, 'var(--live)'], ['건너뜀', skipped, 'var(--ink-soft)'], ['거부·오류', failed, 'var(--stamp)']].map(
            ([label, n, color]) => (
              <div key={String(label)}>
                <Stencil>{label as string}</Stencil>
                <p className="tabular mt-0.5 text-[24px] font-bold" style={{ color: color as string }}>{n as number}</p>
              </div>
            ),
          )}
        </div>

        <DashRule className="my-4" />

        {events.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-[18px]">아직 도착한 세션이 없습니다.</p>
            <p className="mt-2 text-[15px] leading-relaxed text-[var(--ink-soft)]">
              훅을 설치한 폴더에서 <code className="tabular">claude</code> 를 띄우고 작업한 뒤
              <br />
              <code className="tabular">/clear</code> 하거나 창을 닫으면 여기에 줄이 뜹니다.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-dotted divide-[var(--rule)]">
            <AnimatePresence initial={false} mode="popLayout">
              {events.map((e) => <Row key={e.id} e={e} />)}
            </AnimatePresence>
          </ul>
        )}
      </Roll>

      <p className="mt-5 text-[15px] leading-relaxed text-[var(--ink-soft)]">
        <strong className="text-[var(--ink)]">건너뜀이 정상입니다.</strong> 모든 세션이 공유되지는 않습니다 —
        팀에 영향을 주지 않는 세션, 너무 짧은 세션, 개인 브랜치 세션은 여기까지 오지도 않거나
        여기서 걸러집니다. 브랜치 화이트리스트(L2)와 킬 스위치(L4)는 훅에서 막으므로
        이 목록에 아예 나타나지 않습니다.
      </p>
    </div>
  );
}
