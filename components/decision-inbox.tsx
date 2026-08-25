'use client';

import Link from 'next/link';
import { useState } from 'react';
import { resolveDecision } from '@/app/p/[projectId]/inbox/actions';
import { whenLabel } from '@/lib/no-meeting/labels';
import type { InboxItem } from '@/lib/queries';

/**
 * S · 결정 인박스 (FR-4)
 *
 * 사람에게 올라온 결정이 여기 하나로 모인다. 출처는 둘이다 —
 * 훅이 세션 요약에서 뽑은 것과, 회의 판정이 만든 결정 카드.
 * 인박스가 둘이면 "보고하지 않는다. 결정만 한다" 가 성립하지 않는다.
 */
export function DecisionInbox({
  projectId, items,
}: { projectId: string; items: InboxItem[] }) {
  const open = items.filter((i) => i.status === 'open');
  const done = items.filter((i) => i.status === 'resolved');

  return (
    <div>
      <section className="grid-paper bg-[var(--navy)] text-white">
        <div className="mx-auto max-w-[840px] px-5 py-9 sm:px-10 sm:py-11">
          <div className="flex flex-wrap items-center gap-2 text-[14px] font-medium text-[var(--navy-ink-faint)]">
            <span>no meeting</span>
            <span className="text-[var(--navy-divider)]">/</span>
            <span className="font-semibold text-white">결정 인박스</span>
          </div>
          <h1 className="mt-5 text-[32px] font-bold leading-tight tracking-tight sm:text-[40px]">결정</h1>
          <p className="mt-3 max-w-[62ch] text-[17px] leading-relaxed text-[var(--navy-ink-soft)]">
            읽을 것은 없습니다. <strong className="text-white">고를 것만 있습니다.</strong>
            <br />
            에이전트가 스스로 정하면 안 되는 것과, 회의 대신 올라온 판단이 여기 모입니다.
          </p>
          <div className="mt-7 flex items-baseline gap-2">
            <span className="tabular text-[52px] font-bold leading-none" style={{ color: open.length === 0 ? '#7fdca9' : '#ffffff' }}>
              {open.length}
            </span>
            <span className="text-[16px] font-semibold text-[var(--navy-ink-faint)]">건 대기</span>
          </div>
        </div>
      </section>

      <div className="mx-auto w-full max-w-[840px] px-5 py-9 sm:px-10">
        {open.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <span className="stamp px-4 py-1.5 text-[13px] font-bold">inbox zero</span>
            <p className="text-[17px] leading-relaxed text-[var(--ink-soft)]">
              지금 사람이 판단할 것이 없습니다.
              <br />
              <span className="text-[15px]">가장 좋은 상태입니다.</span>
            </p>
          </div>
        ) : (
          <ul className="space-y-4">
            {open.map((d) => <InboxCard key={d.id} projectId={projectId} d={d} />)}
          </ul>
        )}

        {done.length > 0 && (
          <section className="mt-12">
            <h2 className="border-b border-[var(--rule)] pb-2.5 text-[15px] font-bold text-[var(--ink-faint)]">
              닫힌 결정 · {done.length}건
            </h2>
            <ul className="mt-3 divide-y divide-[var(--rule-soft)]">
              {done.map((d) => (
                <li key={d.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3">
                  <span className="min-w-0 flex-1 text-[15.5px] leading-snug text-[var(--ink-soft)]">{d.question}</span>
                  <span className="text-[14px] font-semibold text-[var(--live)]">{d.resolvedChoice}</span>
                  <span className="tabular text-[12.5px] text-[var(--placeholder)]">{whenLabel(d.createdAt)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

function InboxCard({ projectId, d }: { projectId: string; d: InboxItem }) {
  const [busy, setBusy] = useState(false);
  const fromMeeting = !!d.evaluationId;

  return (
    <li className="rounded-sm border-2 border-[var(--ink)] bg-white px-6 py-6">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className="tabular rounded-sm border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.14em]"
          style={{
            color: fromMeeting ? 'var(--verdict-decide)' : 'var(--ink-faint)',
            borderColor: fromMeeting ? 'var(--verdict-decide)' : 'var(--input-border)',
          }}
        >
          {fromMeeting ? '회의 대신' : '세션에서'}
        </span>
        {d.dueAt && (
          <span className="tabular text-[13.5px] text-[var(--placeholder)]">
            {whenLabel(d.dueAt)}까지
          </span>
        )}
      </div>

      <h3 className="mt-3 text-[21px] font-bold leading-snug">{d.question}</h3>

      {/* 이 카드가 투표 앱과 다른 이유는 선택지가 아니라 이 문장이다. */}
      {d.whyYou && (
        <p className="mt-2.5 border-l-[3px] border-[var(--accent)] py-1 pl-4 text-[15.5px] leading-relaxed text-[var(--ink-soft)]">
          왜 제가 받았나요 — {d.whyYou}
        </p>
      )}

      {fromMeeting ? (
        <Link
          href={`/p/${projectId}/no-meeting/e/${d.evaluationId}/decision`}
          className="mt-5 inline-flex h-11 items-center rounded-sm bg-[var(--ink)] px-5 text-[15px] font-bold text-white hover:no-underline"
        >
          결정 카드 열기
        </Link>
      ) : (
        <div className="mt-5 space-y-2.5">
          {d.options.map((o) => (
            <button
              key={o.label}
              disabled={busy}
              onClick={() => { setBusy(true); void resolveDecision(projectId, d.id, o.label); }}
              className="block w-full rounded-sm border-2 border-[var(--ink)] bg-white px-5 py-4 text-left transition-colors hover:border-[var(--accent)] hover:bg-[#f5f8ff] disabled:opacity-50"
            >
              <span className="block text-[17px] font-bold">{o.label}</span>
              {o.rationale && (
                <span className="mt-1 block text-[15px] leading-snug text-[var(--ink-soft)]">{o.rationale}</span>
              )}
            </button>
          ))}
        </div>
      )}

      <p className="mt-4 text-[13.5px] text-[var(--placeholder)]">
        {d.sourceContextId ? `근거 · context:${d.sourceContextId}` : '근거 · 회의 판정'}
        {' · '}{whenLabel(d.createdAt)}
      </p>
    </li>
  );
}
