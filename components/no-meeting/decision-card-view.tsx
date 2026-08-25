'use client';

import Link from 'next/link';
import { useState } from 'react';
import { clockLabel, whenLabel } from '@/lib/no-meeting/labels';
import { useNoMeeting } from '@/lib/no-meeting/store';
import type { DecisionCardContent } from '@/lib/no-meeting/types';
import { BackLink, outlineBtn, solidBtn } from './atoms';

/**
 * S-003 · 결정 카드
 *
 * 모바일 폭으로 고정한다. 30초 안에 읽고 고르는 화면이지 분석 화면이 아니다.
 * 이 카드의 차별점은 선택지가 아니라 "왜 제가 받았나요" 다. 그게 없으면 투표 앱이다.
 */
export function DecisionCardView({ projectId, evaluationId }: { projectId: string; evaluationId: string }) {
  const { evaluationOf, decide, revert, policies } = useNoMeeting();
  const ev = evaluationOf(evaluationId);
  const [reverting, setReverting] = useState(false);
  const [reason, setReason] = useState('');

  if (!ev || ev.artifact?.type !== 'DECISION_CARD') {
    return <Missing projectId={projectId} what="결정 카드" />;
  }

  const c: DecisionCardContent = ev.artifact.content;
  const status = ev.decisionStatus ?? 'PENDING';
  const chosen = c.options.find((o) => o.key === ev.selectedOptionKey) ?? null;
  const candidate = policies.find((p) => p.patternKey === ev.patternKey && p.status === 'CANDIDATE');
  const reasonOk = reason.trim().length >= 10;

  return (
    <div>
      <section className="grid-paper bg-[var(--navy)] text-white">
        <div className="mx-auto max-w-[720px] px-5 py-9 sm:px-8">
          <div className="flex flex-wrap items-center gap-2 text-[14px] font-medium text-[var(--navy-ink-faint)]">
            <Link href={`/p/${projectId}/no-meeting`} className="hover:text-white">NO MEETING</Link>
            <span className="text-[var(--navy-divider)]">/</span>
            <span className="font-semibold text-white">결정 카드</span>
          </div>
          <p className="mt-4 text-[15px] leading-relaxed text-[var(--navy-ink-soft)]">
            회의 대신 이 카드 한 장이 올라왔습니다. 조건 판정은 끝났고, 남은 건 판단 하나입니다.
          </p>
        </div>
      </section>

      <div className="mx-auto w-full max-w-[720px] px-5 py-9 sm:px-8">
        <BackLink href={`/p/${projectId}/no-meeting/e/${ev.id}`}>← 판정 근거로</BackLink>

        <article
          className="card-drop mt-6 rounded-sm border border-[var(--rule)] bg-white px-6 py-7 shadow-[0_2px_10px_rgba(20,22,26,.08)] sm:px-8"
          style={{ borderTop: `3px solid ${status === 'PENDING' ? 'var(--stamp)' : 'var(--rule)'}` }}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <span
              className="font-[family-name:var(--font-receipt-mono)] text-[12px] font-semibold uppercase tracking-[0.16em]"
              style={{ color: status === 'PENDING' ? 'var(--stamp)' : 'var(--ink-faint)' }}
            >
              {status === 'PENDING' ? '사람 판단 필요' : status === 'DECIDED' ? '결정됨' : '되돌림'}
            </span>
            <span className="tabular text-[13.5px] text-[var(--placeholder)]">
              기한 {clockLabel(c.dueAt)} · {whenLabel(c.dueAt)}
            </span>
          </div>

          <h1 className="mt-4 text-[25px] font-bold leading-snug sm:text-[28px]">{c.question}</h1>

          {/* 이 카드의 심장 */}
          <section className="mt-6 border-l-[3px] border-[var(--stamp)] bg-[#fdf6f4] px-5 py-4">
            <span className="stencil !text-[var(--stamp)]">왜 제가 받았나요</span>
            <p className="mt-2 text-[16px] leading-relaxed text-[var(--ink)]">{c.whyYou}</p>
          </section>

          {/* 선행 조건 — 이미 끝난 것들 */}
          {c.prerequisites.length > 0 && (
            <section className="mt-6">
              <span className="stencil">이미 확인된 것</span>
              <ul className="mt-2.5 space-y-1.5">
                {c.prerequisites.map((label) => (
                  <li key={label} className="flex items-baseline gap-2.5 text-[15.5px]">
                    <span className="shrink-0 text-[13px] font-bold text-[var(--live)]">✓</span>
                    <span className="text-[var(--ink-soft)]">{label}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[14px] text-[var(--placeholder)]">
                이건 다시 묻지 않습니다. 시스템이 이미 확인했습니다.
              </p>
            </section>
          )}

          {/* 선택지 */}
          <section className="mt-7 space-y-4">
            {c.options.map((o) => {
              const isChosen = chosen?.key === o.key;
              const recommended = c.recommendedKey === o.key;

              if (status !== 'PENDING') {
                return (
                  <div
                    key={o.key}
                    className={
                      isChosen
                        ? 'relative rounded-sm border-2 border-[var(--stamp)] bg-[var(--highlight)] px-5 py-4'
                        : 'rounded-sm border border-[var(--input-border)] bg-white px-5 py-4 opacity-60'
                    }
                  >
                    <OptionBody o={o} recommended={recommended} muted={!isChosen} />
                    {isChosen && (
                      <span className="stamp absolute -right-2 -top-3 rotate-[-6deg] bg-white px-2 py-0.5 text-[11px] font-bold">
                        {status === 'REVERTED' ? '되돌림' : '선택됨'}
                      </span>
                    )}
                  </div>
                );
              }

              return (
                <button
                  key={o.key}
                  onClick={() => decide(ev.id, o.key)}
                  className="block w-full rounded-sm border-2 border-[var(--ink)] bg-white px-5 py-4 text-left transition-colors hover:border-[var(--accent)] hover:bg-[#f5f8ff]"
                >
                  <OptionBody o={o} recommended={recommended} />
                </button>
              );
            })}
          </section>

          {c.recommendedKey && c.recommendationScore !== null && (
            <p className="mt-4 text-[14.5px] leading-relaxed text-[var(--placeholder)]">
              AI 추천 · {c.options.find((o) => o.key === c.recommendedKey)?.label} (가설 점수 {c.recommendationScore.toFixed(2)})
              <br />
              추천은 근거를 모아 정렬한 결과일 뿐입니다. 결정은 {c.deciderRole}가 합니다.
            </p>
          )}

          {/* 되돌리기 */}
          {status === 'DECIDED' && (
            <section className="mt-7 border-t border-dashed border-[var(--rule)] pt-5">
              {!reverting ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-[14.5px] text-[var(--ink-soft)]">
                    판단이 바뀌었다면 되돌릴 수 있습니다. 기존 기록은 지워지지 않습니다.
                  </p>
                  <button onClick={() => setReverting(true)} className={outlineBtn}>되돌리기</button>
                </div>
              ) : (
                <div>
                  <label htmlFor="revert-reason" className="stencil block">되돌림 사유</label>
                  <textarea
                    id="revert-reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={3}
                    placeholder="무엇이 바뀌었는지 한 줄로 적어주세요. 이 문장이 원장에 남습니다."
                    className="mt-2 w-full rounded-sm border border-[var(--input-border)] px-4 py-3 text-[15.5px] leading-relaxed outline-none focus:border-[var(--ink)]"
                  />
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                    <span className="tabular text-[13px]" style={{ color: reasonOk ? 'var(--live)' : 'var(--placeholder)' }}>
                      {reason.trim().length} / 최소 10자
                    </span>
                    <div className="flex gap-2">
                      <button onClick={() => { setReverting(false); setReason(''); }} className={outlineBtn}>취소</button>
                      <button
                        disabled={!reasonOk}
                        onClick={() => { revert(ev.id, reason.trim()); setReverting(false); }}
                        className={solidBtn}
                      >
                        되돌림 확정
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </section>
          )}

          {status === 'REVERTED' && (
            <section className="mt-7 border-t border-dashed border-[var(--rule)] pt-5">
              <span className="stencil !text-[var(--verdict-shrink)]">되돌림 사유</span>
              <p className="mt-2 text-[15.5px] leading-relaxed">{ev.revertReason}</p>
              <p className="mt-2 text-[14px] text-[var(--placeholder)]">
                이 결정은 정책 학습에서 영구히 제외됩니다. 잘못된 판단이 정책으로 굳는 것을 막습니다.
              </p>
            </section>
          )}
        </article>

        {/* 결정 직후 — 반복이 쌓이면 정책이 된다 */}
        {status === 'DECIDED' && candidate && (
          <div
            className="mt-6 rounded-sm border-2 px-6 py-5"
            style={{ borderColor: candidate.decisionCount >= candidate.threshold ? 'var(--live)' : 'var(--rule)' }}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <span className="stencil">같은 판단 반복</span>
              <span className="tabular text-[15px] font-bold">
                {candidate.decisionCount} / {candidate.threshold}회
              </span>
            </div>
            <p className="mt-2 text-[16px] leading-relaxed">
              {candidate.decisionCount >= candidate.threshold ? (
                <>
                  같은 결정이 {candidate.threshold}번 반복됐습니다. 이제 <strong>정책으로 만들 수 있습니다.</strong>
                  <br />
                  <span className="text-[15px] text-[var(--ink-soft)]">등록하면 다음부터 이 결정은 발생하지 않습니다.</span>
                </>
              ) : (
                <>
                  이 판단은 지금까지 {candidate.decisionCount}번 나왔습니다. {candidate.threshold - candidate.decisionCount}번 더 반복되면 정책 후보가 됩니다.
                </>
              )}
            </p>
            <Link href={`/p/${projectId}/no-meeting/ledger`} className={`${outlineBtn} mt-4`}>
              원장에서 정책 후보 보기
            </Link>
          </div>
        )}

        <div className="mt-8 flex flex-wrap gap-3">
          <Link href={`/p/${projectId}/no-meeting/e/${ev.id}`} className={outlineBtn}>판정 근거 보기</Link>
          <Link href={`/p/${projectId}/no-meeting/ledger`} className={outlineBtn}>원장</Link>
        </div>
      </div>
    </div>
  );
}

function OptionBody({
  o, recommended, muted = false,
}: { o: DecisionCardContent['options'][number]; recommended: boolean; muted?: boolean }) {
  return (
    <>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className={`text-[18px] font-bold leading-snug ${muted ? 'text-[var(--ink-soft)]' : ''}`}>{o.label}</span>
        {recommended && (
          <span className="tabular rounded-sm border border-[var(--accent)] px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.12em] text-[var(--accent)]">
            추천
          </span>
        )}
      </div>
      <ul className="mt-2 space-y-1">
        {o.pros.map((p) => (
          <li key={p} className="flex gap-2 text-[15px] leading-snug text-[var(--ink-soft)]">
            <span className="shrink-0 font-bold text-[var(--live)]">✓</span><span>{p}</span>
          </li>
        ))}
        {o.cons.map((p) => (
          <li key={p} className="flex gap-2 text-[15px] leading-snug text-[var(--ink-soft)]">
            <span className="shrink-0 font-bold text-[var(--verdict-shrink)]">△</span><span>{p}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

export function Missing({ projectId, what }: { projectId: string; what: string }) {
  return (
    <div className="mx-auto max-w-[720px] px-5 py-20 text-center sm:px-8">
      <span className="stamp px-4 py-1.5 text-[13px] font-bold">not found</span>
      <p className="mt-5 text-[18px]">이 판정에는 {what}가 없습니다.</p>
      <p className="mt-2 text-[15px] text-[var(--ink-soft)]">
        목업 단계라 판정은 브라우저 탭에만 남습니다. 오늘 화면에서 다시 판정해 주세요.
      </p>
      <Link href={`/p/${projectId}/no-meeting`} className={`${outlineBtn} mt-6`}>오늘로 돌아가기</Link>
    </div>
  );
}
