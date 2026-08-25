'use client';

import Link from 'next/link';
import { OUTCOME } from '@/lib/no-meeting/labels';
import type { AgendaKind, Evaluation, MeetingPrescriptionContent } from '@/lib/no-meeting/types';
import { BackLink, DotLine, outlineBtn } from './atoms';

const AGENDA_KIND: Record<AgendaKind, string> = { INFO: '확인', QUESTION: '질의', DECISION: '결정' };
import { Missing } from './decision-card-view';

/**
 * S-004 · 회의 처방전
 *
 * 회의를 없애는 제품이 회의를 만드는 화면. 그래서 여기서는 네 가지를 반드시 쓴다.
 *   1. 제외한 사람에게 근거를 붙인다 — "필요 없습니다"가 아니라 "영향 범위 밖입니다"
 *   2. 시간을 관성이 아니라 안건 수에서 계산한다
 *   3. 회의 전에 읽을 것을 만들어 준다
 *   4. 종료 조건을 시간이 아니라 산출물로 쓴다
 */
export function PrescriptionView({ projectId, ev }: { projectId: string; ev: Evaluation | null }) {

  if (!ev || ev.artifact?.type !== 'MEETING_PRESCRIPTION' || !ev.outcome) {
    return <Missing projectId={projectId} what="회의 처방전" />;
  }

  const c: MeetingPrescriptionContent = ev.artifact.content;
  const included = c.attendees.filter((a) => a.included);
  const excluded = c.attendees.filter((a) => !a.included);
  const o = OUTCOME[ev.outcome];
  const skipped = c.attendees.length === 0;

  return (
    <div>
      <section className="grid-paper bg-[var(--navy)] text-white">
        <div className="mx-auto max-w-[880px] px-5 py-9 sm:px-10 sm:py-11">
          <div className="flex flex-wrap items-center gap-2 text-[14px] font-medium text-[var(--navy-ink-faint)]">
            <Link href={`/p/${projectId}/no-meeting`} className="hover:text-white">NO MEETING</Link>
            <span className="text-[var(--navy-divider)]">/</span>
            <span className="font-semibold text-white">회의 처방전</span>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-4">
            <span
              className="inline-flex items-center rounded-sm border-2 px-4 py-1.5 font-[family-name:var(--font-receipt-mono)] text-[14px] font-bold uppercase tracking-[0.16em]"
              style={{ borderColor: '#fff', color: '#fff' }}
            >
              {o.short}
            </span>
            <span className="text-[16px] font-semibold text-[var(--navy-ink-soft)]">{o.label}</span>
          </div>

          <h1 className="mt-4 text-[27px] font-bold leading-snug tracking-tight sm:text-[33px]">
            {c.purpose === '확인 필요'
              ? <span className="text-[var(--navy-ink-faint)]">목적 · 확인 필요</span>
              : c.purpose}
          </h1>
          <p className="mt-3 max-w-[66ch] text-[16.5px] leading-relaxed text-[var(--navy-ink-soft)]">{c.reason}</p>
        </div>
      </section>

      <div className="mx-auto w-full max-w-[880px] px-5 py-9 sm:px-10">
        <BackLink href={`/p/${projectId}/no-meeting/e/${ev.id}`}>← 판정 근거로</BackLink>

        {skipped ? (
          <div className="mt-7 rounded-sm border-2 border-dashed border-[var(--input-border)] px-6 py-8 text-center">
            <span className="stencil">분석하지 않음</span>
            <p className="mt-3 text-[19px] font-bold leading-snug">이 회의는 분해하지 않습니다.</p>
            <p className="mx-auto mt-3 max-w-[52ch] text-[16px] leading-relaxed text-[var(--ink-soft)]">
              {c.reason}
              <br />
              <span className="text-[15px] text-[var(--placeholder)]">
                분석했다가 봐준 게 아니라 애초에 대상이 아니었습니다.
                참석자·안건·시간 어느 것도 시스템이 정하지 않습니다.
              </span>
            </p>
          </div>
        ) : (
          <>
            {/* ── 축소 요약 ─────────────────────────────────────── */}
            <section className="mt-7 grid gap-px overflow-hidden rounded-sm border border-[var(--rule)] bg-[var(--rule)] sm:grid-cols-3">
              <Shrink label="참석자" before={`${c.askedAttendees.length}명`} after={`${included.length}명`} accent />
              <Shrink label="안건" before={`${c.agendas.length + c.splitOff.length}건`} after={`${c.agendas.length}건`} />
              <Shrink label="요청 시간" before={`${c.askedMinutes}분`} after="안건 기준" />
            </section>

            <p className="mt-3 text-[14px] leading-relaxed text-[var(--placeholder)]">
              참석자는 근거에 등장하는 사람만 남겼습니다. 관련도를 점수로 추정하지 않습니다 —
              기록에 있거나 없거나입니다. 시간은 신청자가 적은 값이라 줄었다고 세지 않습니다.
            </p>

            {/* ── 참석자 ────────────────────────────────────────── */}
            <section className="mt-9">
              <h2 className="border-b-2 border-[var(--ink)] pb-2.5 text-[21px] font-bold">참석자</h2>
              <ul className="mt-4 space-y-3">
                {included.map((a) => <AttendeeRow key={a.key} a={a} />)}
              </ul>

              {excluded.length > 0 && (
                <>
                  <h3 className="mt-7 border-b border-[var(--rule)] pb-2 text-[15px] font-semibold text-[var(--ink-faint)]">
                    제외 · {excluded.length}명
                  </h3>
                  <ul className="mt-3 space-y-3">
                    {excluded.map((a) => <AttendeeRow key={a.key} a={a} />)}
                  </ul>
                  <p className="mt-3 text-[14px] leading-relaxed text-[var(--placeholder)]">
                    제외에는 반드시 근거를 붙입니다. “필요 없습니다”가 아니라 “영향 범위 밖입니다”라고 씁니다.
                    제외된 사람은 결과를 로그로 받습니다.
                  </p>
                </>
              )}
            </section>

            {/* ── 안건 ──────────────────────────────────────────── */}
            <section className="mt-9">
              <h2 className="flex flex-wrap items-baseline justify-between gap-3 border-b-2 border-[var(--ink)] pb-2.5">
                <span className="text-[21px] font-bold">안건</span>
                <span className="tabular text-[14px] font-medium text-[var(--ink-faint)]">
                  {c.agendas.length}건
                </span>
              </h2>
              <ol className="mt-4 divide-y divide-[var(--rule-soft)]">
                {c.agendas.map((a, i) => (
                  <li key={a.title} className="flex items-baseline gap-4 py-3.5">
                    <span className="tabular w-6 shrink-0 text-[13px] font-bold text-[var(--placeholder)]">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className="min-w-0 flex-1 text-[17px] font-semibold leading-snug">{a.title}</span>
                    <span className="tabular shrink-0 rounded-sm bg-[var(--card-tint)] px-2 py-0.5 text-[12px] font-bold">
                      {AGENDA_KIND[a.kind]}
                    </span>
                  </li>
                ))}
              </ol>

              {c.splitOff.length > 0 && (
                <div className="mt-5 rounded-sm border border-dashed border-[var(--rule)] bg-[var(--card-tint)] px-5 py-4">
                  <span className="stencil">분리된 안건</span>
                  <ul className="mt-2.5 space-y-2.5">
                    {c.splitOff.map((s) => (
                      <li key={s.title}>
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="text-[16px] font-bold">{s.title}</span>
                          <span className="tabular text-[14px] font-semibold text-[var(--ink-faint)]">모이지 않고 처리</span>
                        </div>
                        <p className="mt-0.5 text-[14.5px] leading-snug text-[var(--ink-soft)]">{s.reason}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            {/* ── 사전 자료 ─────────────────────────────────────── */}
            {c.preReads.length > 0 && (
              <section className="mt-9">
                <h2 className="border-b-2 border-[var(--ink)] pb-2.5 text-[21px] font-bold">먼저 읽을 것</h2>
                <ul className="mt-3.5 space-y-2">
                  {c.preReads.map((r) => (
                    <li key={r} className="flex gap-3 text-[16px] leading-snug">
                      <span className="shrink-0 text-[var(--accent)]">→</span>
                      <span className="text-[var(--ink-soft)]">{r}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-[14px] leading-relaxed text-[var(--placeholder)]">
                  회의 시간의 대부분은 컨텍스트 공유에 쓰입니다. 그 부분은 이미 위에서 끝났습니다.
                </p>
              </section>
            )}

            {/* ── 종료 조건 ─────────────────────────────────────── */}
            <section className="mt-9">
              <h2 className="border-b-2 border-[var(--ink)] pb-2.5 text-[21px] font-bold">종료 조건</h2>
              <ul className="mt-3.5 space-y-2.5">
                {c.exitCriteria.map((x) => (
                  <li key={x} className="flex gap-3">
                    <span
                      aria-hidden
                      className="mt-[3px] h-[18px] w-[18px] shrink-0 rounded-sm border-2 border-[var(--ink)]"
                    />
                    <span className="text-[16.5px] leading-snug">{x}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3.5 rounded-sm bg-[var(--card-tint)] px-4 py-3 text-[15px] leading-relaxed text-[var(--ink-soft)]">
                위 항목이 채워지면 종료합니다. <strong className="text-[var(--ink)]">시간이 아니라 산출물 기준입니다.</strong>{' '}
                회의가 늘어지는 근본 원인은 종료 조건이 “{c.askedMinutes}분”이기 때문입니다.
              </p>
            </section>
          </>
        )}

        {/* ── 실행 경계 ─────────────────────────────────────────── */}
        <section className="mt-10 rounded-sm border border-[var(--rule)] px-5 py-5">
          <span className="stencil">이 화면이 하지 않는 것</span>
          <div className="mt-2.5 text-[15px]">
            <DotLine label="캘린더 일정 생성 · 수정" value="하지 않음" />
            <DotLine label="참석자에게 초대 발송" value="하지 않음" />
            <DotLine label="Jira · 배포 상태 변경" value="하지 않음" />
          </div>
          <p className="mt-3 text-[14px] leading-relaxed text-[var(--placeholder)]">
            판정과 외부 실행은 분리되어 있습니다. 실제로 일정을 잡는 것은 승인·권한·복구 설계가 끝난 뒤의 일입니다.
          </p>
        </section>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link href={`/p/${projectId}/no-meeting/e/${ev.id}`} className={outlineBtn}>판정 근거 보기</Link>
          <Link href={`/p/${projectId}/no-meeting/ledger`} className={outlineBtn}>원장</Link>
          <Link href={`/p/${projectId}/no-meeting`} className={outlineBtn}>오늘</Link>
        </div>
      </div>
    </div>
  );
}

function Shrink({ label, before, after, accent = false }: { label: string; before: string; after: string; accent?: boolean }) {
  return (
    <div className="bg-white px-5 py-4">
      <span className="stencil !text-[10px]">{label}</span>
      <div className="mt-1.5 flex items-baseline gap-2.5">
        <span className="tabular text-[19px] font-semibold text-[var(--placeholder)] line-through">{before}</span>
        <span className="text-[var(--rule)]">→</span>
        <span
          className="tabular text-[26px] font-bold leading-none"
          style={{ color: accent ? 'var(--accent)' : 'var(--ink)' }}
        >
          {after}
        </span>
      </div>
    </div>
  );
}

function AttendeeRow({ a }: { a: MeetingPrescriptionContent['attendees'][number] }) {
  return (
    <li className={`flex flex-wrap items-center gap-x-4 gap-y-2 ${a.included ? '' : 'opacity-70'}`}>
      <span
        aria-hidden
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ background: a.included ? 'var(--ink)' : 'transparent', border: a.included ? 'none' : '1.5px solid var(--placeholder)' }}
      />
      <span className="w-[64px] shrink-0 text-[17px] font-bold">{a.name}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] leading-snug text-[var(--ink-soft)]">{a.reason}</span>
      </span>
      <span
        className="tabular w-[44px] shrink-0 text-right text-[12px] font-bold uppercase tracking-[0.1em]"
        style={{ color: a.included ? 'var(--ink)' : 'var(--placeholder)' }}
      >
        {a.included ? '필수' : '제외'}
      </span>
    </li>
  );
}
