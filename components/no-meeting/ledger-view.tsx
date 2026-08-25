'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { LEDGER_EVENT, OUTCOME, clockLabel, whenLabel } from '@/lib/no-meeting/labels';
import { useNoMeeting } from '@/lib/no-meeting/store';
import type { LedgerEntry, LedgerEventType, Outcome, Policy } from '@/lib/no-meeting/types';
import { SectionHead, VerdictStamp, outlineBtn, solidBtn } from './atoms';

/**
 * S-005 · 결정 원장
 *
 * 이 서비스가 축적하는 유일한 자산. 두 가지 질문에 답한다.
 *   "그때 왜 그렇게 판정했나" — 삭제 감사 추적
 *   "이 판단을 또 사람에게 물을 것인가" — 정책 승격
 */
const EVENT_FILTERS: (LedgerEventType | 'ALL')[] = ['ALL', 'EVALUATED', 'DECIDED', 'REVERTED', 'POLICY_ACTIVATED'];
const OUTCOME_FILTERS: (Outcome | 'ALL')[] = ['ALL', 'DELETE', 'ASYNC', 'DECIDE', 'SHRINK', 'MEET'];

export function LedgerView({ projectId }: { projectId: string }) {
  const { ledger, policies, evaluations } = useNoMeeting();
  const [event, setEvent] = useState<LedgerEventType | 'ALL'>('ALL');
  const [outcome, setOutcome] = useState<Outcome | 'ALL'>('ALL');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const items = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return ledger
      .filter((l) => {
        if (event !== 'ALL' && l.eventType !== event) return false;
        if (outcome !== 'ALL' && l.outcome !== outcome) return false;
        if (needle && !(`${l.title} ${l.summary}`.toLowerCase().includes(needle))) return false;
        return true;
      })
      // 최신순. 같은 시각이면 id 로 안정 정렬한다 — 페이지가 흔들리지 않게.
      .sort((a, b) => {
        const d = b.occurredAt.localeCompare(a.occurredAt);
        return d !== 0 ? d : b.id.localeCompare(a.id);
      });
  }, [ledger, event, outcome, q]);

  const filtered = event !== 'ALL' || outcome !== 'ALL' || q.trim() !== '';

  return (
    <div>
      <section className="grid-paper bg-[var(--navy)] text-white">
        <div className="mx-auto max-w-[1000px] px-5 py-9 sm:px-10 sm:py-11">
          <div className="flex flex-wrap items-center gap-2 text-[14px] font-medium text-[var(--navy-ink-faint)]">
            <Link href={`/p/${projectId}/no-meeting`} className="hover:text-white">NO MEETING</Link>
            <span className="text-[var(--navy-divider)]">/</span>
            <span className="font-semibold text-white">결정 원장</span>
          </div>
          <h1 className="mt-5 text-[32px] font-bold leading-tight tracking-tight sm:text-[40px]">결정 원장</h1>
          <p className="mt-3 max-w-[64ch] text-[17px] leading-relaxed text-[var(--navy-ink-soft)]">
            판정과 결정을 시각·근거·규칙 버전과 함께 남깁니다.
            <strong className="text-white"> 없앴다가 사고가 나면</strong> 당시 무엇을 보고 없앴는지 여기서 되짚습니다.
          </p>
        </div>
      </section>

      <div className="mx-auto w-full max-w-[1000px] px-5 py-9 sm:px-10">
        {/* ── 정책 ──────────────────────────────────────────────── */}
        <SectionHead count={`${policies.length}건`}>정책</SectionHead>
        <p className="mt-3 text-[15px] leading-relaxed text-[var(--ink-soft)]">
          회의가 사라진 다음에는 결정이 사라집니다. 같은 판단이 반복되면 정책으로 올립니다.
        </p>
        <ul className="mt-5 space-y-4">
          {policies.map((p) => <PolicyCard key={p.id} p={p} />)}
        </ul>

        {/* ── 이력 ──────────────────────────────────────────────── */}
        <section className="mt-14">
          <SectionHead count={`${items.length} / ${ledger.length}건`}>이력</SectionHead>

          <div className="mt-5 space-y-3">
            <FilterRow label="이벤트">
              {EVENT_FILTERS.map((e) => (
                <Chip key={e} on={event === e} onClick={() => setEvent(e)}>
                  {e === 'ALL' ? '전체' : LEDGER_EVENT[e].label}
                </Chip>
              ))}
            </FilterRow>
            <FilterRow label="결과">
              {OUTCOME_FILTERS.map((o) => (
                <Chip key={o} on={outcome === o} onClick={() => setOutcome(o)} ink={o === 'ALL' ? undefined : OUTCOME[o].ink}>
                  {o === 'ALL' ? '전체' : OUTCOME[o].short}
                </Chip>
              ))}
            </FilterRow>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="제목·요약 검색"
              aria-label="원장 검색"
              className="h-11 w-full rounded-sm border border-[var(--input-border)] px-4 text-[15.5px] outline-none focus:border-[var(--ink)]"
            />
          </div>

          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-14 text-center">
              <span className="stamp px-4 py-1.5 text-[13px] font-bold">no entries</span>
              <p className="text-[17px] text-[var(--ink-soft)]">
                {filtered ? '조건에 맞는 기록이 없습니다.' : '아직 남은 기록이 없습니다.'}
              </p>
              {filtered && (
                <button
                  onClick={() => { setEvent('ALL'); setOutcome('ALL'); setQ(''); }}
                  className="text-[14.5px] font-semibold text-[var(--accent)] hover:underline"
                >
                  필터 지우기
                </button>
              )}
            </div>
          ) : (
            <ul className="mt-6">
              {items.map((l, i) => (
                <LedgerRow
                  key={l.id}
                  l={l}
                  projectId={projectId}
                  last={i === items.length - 1}
                  open={openId === l.id}
                  onToggle={() => setOpenId(openId === l.id ? null : l.id)}
                  hasTarget={!!l.evaluationId && evaluations.some((e) => e.id === l.evaluationId)}
                />
              ))}
            </ul>
          )}

          <p className="mt-8 border-t border-[var(--rule)] pt-4 text-[14px] leading-relaxed text-[var(--placeholder)]">
            원장 항목은 수정하거나 삭제할 수 없습니다. 되돌린 결정도 지우지 않고 되돌림 이벤트를 하나 더 붙입니다.
          </p>
        </section>
      </div>
    </div>
  );
}

// ── 정책 카드 ─────────────────────────────────────────────────────

function PolicyCard({ p }: { p: Policy }) {
  const { activatePolicy } = useNoMeeting();
  const [reviewed, setReviewed] = useState(false);
  const ready = p.decisionCount >= p.threshold;
  const active = p.status === 'ACTIVE';

  return (
    <li
      className="rounded-sm border-2 bg-white px-6 py-6"
      style={{ borderColor: active ? 'var(--live)' : ready ? 'var(--ink)' : 'var(--rule)' }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className="tabular rounded-sm border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.14em]"
            style={{
              color: active ? 'var(--live)' : ready ? 'var(--ink)' : 'var(--placeholder)',
              borderColor: active ? 'var(--live)' : ready ? 'var(--ink)' : 'var(--input-border)',
            }}
          >
            {active ? 'active' : 'candidate'}
          </span>
          <h3 className="text-[21px] font-bold">{p.title}</h3>
        </div>
        <span className="tabular text-[15px] font-bold" style={{ color: ready ? 'var(--live)' : 'var(--ink-faint)' }}>
          {p.decisionCount} / {p.threshold}회
        </span>
      </div>

      <p className="mt-3.5 border-l-[3px] border-[var(--ink)] py-1 pl-4 text-[17px] leading-relaxed">
        “{p.rule}”
      </p>
      {p.exception && (
        <p className="mt-2 pl-4 text-[15px] leading-snug text-[var(--ink-soft)]">예외 — {p.exception}</p>
      )}

      <div className="mt-5">
        <span className="stencil">근거 결정 · {p.sourceDecisions.length}건</span>
        {p.sourceDecisions.length === 0 ? (
          <p className="mt-2 text-[15px] text-[var(--placeholder)]">
            근거가 모두 되돌려졌습니다. 이 후보는 등록할 수 없습니다.
          </p>
        ) : (
          <ol className="mt-2 space-y-1">
            {p.sourceDecisions.map((d, i) => (
              <li key={d.id} className="tabular flex flex-wrap items-baseline gap-x-3 text-[14.5px]">
                <span className="text-[var(--placeholder)]">#{String(i + 1).padStart(3, '0')}</span>
                <span className="text-[var(--ink-faint)]">{d.date}</span>
                <span className="font-[family-name:var(--font-receipt-kr)] text-[var(--ink-soft)]">{d.title}</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      {active ? (
        <p className="mt-5 border-t border-dashed border-[var(--rule)] pt-4 text-[15.5px] leading-relaxed">
          <strong>등록됨</strong> · {p.activatedBy} · {p.activatedAt && clockLabel(p.activatedAt)}
          <br />
          <span className="text-[15px] text-[var(--ink-soft)]">
            이제 같은 상황의 판정은 결정 카드를 만들지 않고 해결 로그로 종료됩니다.
            5.2 릴리즈 시나리오를 다시 판정해 보세요 — <strong className="text-[var(--ink)]">DECIDE 가 ASYNC 로 바뀝니다.</strong>
          </span>
        </p>
      ) : (
        <div className="mt-5 border-t border-dashed border-[var(--rule)] pt-4">
          {!ready ? (
            <p className="text-[15.5px] leading-relaxed text-[var(--ink-soft)]">
              {p.threshold - p.decisionCount}건이 더 쌓이면 등록할 수 있습니다.
              5.2 릴리즈 Go/No-Go 를 판정하고 같은 선택을 하면 조건이 채워집니다.
            </p>
          ) : (
            <>
              <label className="flex cursor-pointer items-start gap-3 text-[15.5px] leading-snug">
                <input
                  type="checkbox"
                  checked={reviewed}
                  onChange={(e) => setReviewed(e.target.checked)}
                  className="mt-1 h-[18px] w-[18px] shrink-0 accent-[var(--ink)]"
                />
                <span>위 근거 결정 {p.sourceDecisions.length}건을 확인했습니다. 되돌린 결정은 포함되어 있지 않습니다.</span>
              </label>
              <button
                disabled={!reviewed}
                onClick={() => activatePolicy(p.id)}
                className={`${solidBtn} mt-4`}
              >
                정책으로 등록
              </button>
              <p className="mt-2.5 text-[14px] text-[var(--placeholder)]">
                등록하면 다음부터 이 결정은 사람에게 올라오지 않습니다. 자동 등록은 하지 않습니다.
              </p>
            </>
          )}
        </div>
      )}
    </li>
  );
}

// ── 이력 한 줄 ────────────────────────────────────────────────────

function LedgerRow({
  l, projectId, last, open, onToggle, hasTarget,
}: {
  l: LedgerEntry; projectId: string; last: boolean;
  open: boolean; onToggle: () => void; hasTarget: boolean;
}) {
  const e = LEDGER_EVENT[l.eventType];

  return (
    <li className="relative pl-8 sm:pl-10">
      {!last && <span aria-hidden className="absolute left-[7px] top-5 bottom-0 w-px bg-[var(--rule)] sm:left-[9px]" />}
      <span
        aria-hidden
        className="absolute left-0 top-[17px] h-[15px] w-[15px] rounded-full border-2 bg-white sm:left-[2px]"
        style={{ borderColor: e.ink }}
      />

      <button
        onClick={onToggle}
        className="w-full border-b border-[var(--rule-soft)] py-4 text-left transition-colors hover:bg-[var(--card-tint)]"
      >
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="stencil !text-[10px]" style={{ color: e.ink }}>{e.label}</span>
          {l.outcome && <VerdictStamp outcome={l.outcome} size="sm" />}
          <span className="tabular ml-auto text-[13px] text-[var(--placeholder)]">
            {clockLabel(l.occurredAt)} · {whenLabel(l.occurredAt)}
          </span>
        </div>
        <p className="mt-1.5 text-[17.5px] font-bold leading-snug">{l.title}</p>
        <p className="mt-0.5 text-[15px] leading-snug text-[var(--ink-soft)]">{l.summary}</p>
      </button>

      {open && (
        <div className="border-b border-[var(--rule-soft)] bg-[var(--card-tint)] px-4 py-4">
          <dl className="tabular grid grid-cols-[7rem_1fr] gap-x-4 gap-y-1.5 text-[14.5px]">
            <dt className="text-[var(--placeholder)]">actor</dt>
            <dd className="font-[family-name:var(--font-receipt-kr)]">{l.actor}</dd>
            <dt className="text-[var(--placeholder)]">규칙 버전</dt>
            <dd>{l.ruleVersion}</dd>
            <dt className="text-[var(--placeholder)]">발생</dt>
            <dd>{new Date(l.occurredAt).toLocaleString('ko-KR')}</dd>
            {l.patternKey && (<><dt className="text-[var(--placeholder)]">패턴</dt><dd>{l.patternKey}</dd></>)}
            {l.selectedOptionKey && (<><dt className="text-[var(--placeholder)]">선택</dt><dd>{l.selectedOptionKey}</dd></>)}
          </dl>

          <div className="mt-3.5">
            {l.evaluationId ? (
              hasTarget ? (
                <Link href={`/p/${projectId}/no-meeting/e/${l.evaluationId}`} className={outlineBtn}>
                  당시 근거 열기
                </Link>
              ) : (
                <span className="tabular inline-flex h-11 items-center rounded-sm border border-dashed border-[var(--input-border)] px-4 text-[13px] font-bold uppercase tracking-[0.12em] text-[var(--placeholder)]">
                  reference_missing
                </span>
              )
            ) : (
              <p className="text-[14px] text-[var(--placeholder)]">
                이전 분기에 처리된 항목입니다. 판정 상세는 아카이브에 있습니다.
              </p>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

// ── 필터 ──────────────────────────────────────────────────────────

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="stencil w-[52px] shrink-0 !text-[10px]">{label}</span>
      {children}
    </div>
  );
}

function Chip({
  on, onClick, ink, children,
}: { on: boolean; onClick: () => void; ink?: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="tabular rounded-sm border px-3 py-1 text-[13px] font-semibold transition-colors"
      style={{
        borderColor: on ? (ink ?? 'var(--ink)') : 'var(--rule)',
        background: on ? (ink ?? 'var(--ink)') : 'transparent',
        color: on ? '#fff' : (ink ?? 'var(--ink-faint)'),
      }}
    >
      {children}
    </button>
  );
}
