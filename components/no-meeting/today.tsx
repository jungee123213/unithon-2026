'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { OUTCOME_ARTIFACT, TYPE, clockLabel, whenLabel } from '@/lib/no-meeting/labels';
import { CONNECTORS } from '@/lib/no-meeting/mock-data';
import { useNoMeeting } from '@/lib/no-meeting/store';
import type { Scenario } from '@/lib/no-meeting/types';
import { SectionHead, VerdictStamp, outlineBtn, solidBtn } from './atoms';

/**
 * S-001 · 오늘
 *
 * 이 화면의 가장 좋은 상태는 히어로 숫자가 0인 날이다.
 * 그래서 "처리 완료"를 크게 자랑하지 않고, 사람이 아직 해야 할 일만 크게 쓴다.
 */
export function NoMeetingToday({ projectId }: { projectId: string }) {
  const { scenarios, evaluations, ledger, connections, reset } = useNoMeeting();
  const [openId, setOpenId] = useState<string | null>(null);

  const calendar = connections.calendar;
  const calendarOn = calendar.status === 'CONNECTED';
  const offCount = CONNECTORS.filter((c) => connections[c.id].status === 'DISCONNECTED').length;
  // 캘린더가 회의 요청의 유일한 출처다. 끊기면 큐는 비어 있는 게 맞다.
  const queue = calendarOn ? scenarios : [];

  const pendingDecisions = evaluations.filter((e) => e.decisionStatus === 'PENDING').length;
  const needsClarification = evaluations.filter((e) => e.outcome === null).length;
  const actionRequired = pendingDecisions + needsClarification;

  const removed = evaluations.filter((e) => e.outcome === 'DELETE' || e.outcome === 'ASYNC');
  const savedMinutes = removed.reduce((sum, e) => {
    const c = e.artifact?.type === 'RESOLUTION_LOG' ? e.artifact.content : null;
    return sum + (c ? c.savedPeople * c.savedMinutes : 0);
  }, 0);

  return (
    <div>
      {/* ── 히어로 ─────────────────────────────────────────────── */}
      <section className="grid-paper bg-[var(--navy)] text-white">
        <div className="mx-auto max-w-[1080px] px-5 py-10 sm:px-10 sm:py-12">
          <div className="flex flex-wrap items-center gap-2 text-[14px] font-medium text-[var(--navy-ink-faint)]">
            <Link href={`/p/${projectId}`} className="hover:text-white">TeamSync</Link>
            <span className="text-[var(--navy-divider)]">/</span>
            <span className="font-semibold text-white">NO MEETING</span>
          </div>

          <h1 className="mt-5 text-[34px] font-bold leading-tight tracking-tight sm:text-[42px]">오늘</h1>
          <p className="mt-3 max-w-[62ch] text-[17px] leading-relaxed text-[var(--navy-ink-soft)]">
            회의가 열리기 <strong className="text-white">전에</strong> 판정합니다.
            확인으로 끝나는 일은 여기서 끝내고, 사람이 판단할 것만 위로 올립니다.
          </p>

          <div className="mt-8 grid gap-px overflow-hidden rounded-sm border border-[var(--navy-border-2)] bg-[var(--navy-border-2)] sm:grid-cols-3">
            <HeroStat
              label="사람이 해야 할 일"
              value={actionRequired}
              unit="건"
              accent={actionRequired === 0}
              note={actionRequired === 0 ? '가장 좋은 상태입니다.' : `결정 ${pendingDecisions}건 · 확인 질문 ${needsClarification}건`}
            />
            <HeroStat label="없앤 회의" value={removed.length} unit="건" note="해결 로그로 종료됨" />
            <HeroStat
              label="절약"
              value={savedMinutes}
              unit="분"
              note={savedMinutes > 0 ? `${Math.round(savedMinutes / 60)}시간 · 사람이 앉아 있지 않은 시간` : '아직 판정한 회의가 없습니다'}
            />
          </div>
        </div>
      </section>

      <div className="mx-auto w-full max-w-[1080px] px-5 py-10 sm:px-10">
        {/* ── 판정 대기 큐 ──────────────────────────────────────── */}
        <SectionHead count={`${queue.length}건`}>판정 대기</SectionHead>

        {/* 이 목록이 어디서 왔는지 밝힌다. 출처 없이 뜬 큐는 믿을 이유가 없다. */}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-dashed border-[var(--rule)] pb-3">
          <span className="flex items-center gap-2 text-[14.5px] text-[var(--ink-soft)]">
            <span
              className={`block h-2 w-2 shrink-0 rounded-full ${calendarOn ? 'live-dot' : ''}`}
              style={{ background: calendarOn ? 'var(--live)' : 'var(--placeholder)' }}
            />
            {calendarOn ? (
              <>
                <strong className="font-semibold text-[var(--ink)]">Google Calendar</strong>
                에서 가져온 회의 요청
                {calendar.lastSyncAt && (
                  <span className="tabular text-[13.5px] text-[var(--placeholder)]">
                    · 동기화 {whenLabel(calendar.lastSyncAt)}
                  </span>
                )}
              </>
            ) : (
              <span className="text-[var(--placeholder)]">캘린더가 연결되어 있지 않습니다</span>
            )}
          </span>
          <Link
            href={`/p/${projectId}/no-meeting/connections`}
            className="ml-auto text-[14px] font-semibold text-[var(--accent)]"
          >
            연결 {offCount > 0 && <span className="tabular">· 미연결 {offCount}곳</span>} →
          </Link>
        </div>

        {queue.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-14 text-center">
            <span className="stamp px-4 py-1.5 text-[13px] font-bold">no source</span>
            <p className="text-[17px] leading-relaxed text-[var(--ink-soft)]">
              판정할 회의 요청이 들어오지 않습니다.
              <br />
              <span className="text-[15px]">
                이 제품은 회의를 스스로 만들지 않습니다. 캘린더를 연결해야 큐가 채워집니다.
              </span>
            </p>
            <Link href={`/p/${projectId}/no-meeting/connections`} className={solidBtn}>캘린더 연결하기</Link>
          </div>
        ) : (
          <ul className="mt-6 space-y-4">
            {queue.map((sc) => (
              <ScenarioCard
                key={sc.id}
                sc={sc}
                projectId={projectId}
                open={openId === sc.id}
                onToggle={() => setOpenId(openId === sc.id ? null : sc.id)}
              />
            ))}
          </ul>
        )}

        {/* ── 최근 판정 ─────────────────────────────────────────── */}
        <section className="mt-14">
          <SectionHead count={`${evaluations.length}건`}>최근 판정</SectionHead>
          {evaluations.length === 0 ? (
            <div className="flex flex-col items-center gap-4 py-14 text-center">
              <span className="stamp px-4 py-1.5 text-[13px] font-bold">nothing judged yet</span>
              <p className="text-[17px] leading-relaxed text-[var(--ink-soft)]">
                위에서 회의 하나를 골라 판정해 보세요.
                <br />
                <span className="text-[15px]">입력 값을 바꾸면 결론이 바뀝니다.</span>
              </p>
            </div>
          ) : (
            <ul className="mt-5 divide-y divide-[var(--rule-soft)] border-y border-[var(--rule)]">
              {evaluations.map((e) => (
                <li key={e.id}>
                  <Link
                    href={`/p/${projectId}/no-meeting/e/${e.id}`}
                    className="flex flex-wrap items-center gap-x-4 gap-y-2 px-1 py-4 transition-colors hover:bg-[var(--card-tint)] hover:no-underline"
                  >
                    <span className="w-[86px] shrink-0">
                      {e.outcome
                        ? <VerdictStamp outcome={e.outcome} size="sm" />
                        : <span className="tabular rounded-sm border border-[var(--placeholder)] px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--placeholder)]">T8</span>}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[17px] font-bold text-[var(--ink)]">{e.title}</span>
                      <span className="block text-[14px] text-[var(--ink-faint)]">
                        {TYPE[e.meetingType].code} · {e.outcome ? OUTCOME_ARTIFACT[e.outcome] : '확인 질문'}
                        {e.decisionStatus === 'PENDING' && <strong className="text-[var(--stamp)]"> · 결정 대기</strong>}
                        {e.decisionStatus === 'DECIDED' && <span className="text-[var(--live)]"> · 결정됨</span>}
                        {e.decisionStatus === 'REVERTED' && <span className="text-[var(--verdict-shrink)]"> · 되돌림</span>}
                      </span>
                    </span>
                    <span className="tabular shrink-0 text-[13px] text-[var(--placeholder)]">{whenLabel(e.requestedAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-[var(--rule)] pt-6">
          <Link href={`/p/${projectId}/no-meeting/ledger`} className={outlineBtn}>
            결정 원장 열기 · {ledger.length}건
          </Link>
          <button onClick={reset} className="text-[14px] font-semibold text-[var(--placeholder)] underline-offset-4 hover:text-[var(--ink)] hover:underline">
            데모 초기화
          </button>
        </div>
      </div>
    </div>
  );
}

function HeroStat({
  label, value, unit, note, accent = false,
}: { label: string; value: number; unit: string; note: string; accent?: boolean }) {
  return (
    <div className="bg-[var(--navy)] px-5 py-5 sm:px-6">
      <span className="stencil !text-[10px] !text-[var(--navy-ink-faint-2)]">{label}</span>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span
          className="tabular text-[44px] font-bold leading-none sm:text-[52px]"
          style={{ color: accent ? '#7fdca9' : '#ffffff' }}
        >
          {value.toLocaleString('ko-KR')}
        </span>
        <span className="text-[16px] font-semibold text-[var(--navy-ink-faint)]">{unit}</span>
      </div>
      <p className="mt-2 text-[13.5px] leading-snug text-[var(--navy-ink-faint-2)]">{note}</p>
    </div>
  );
}

// ── 회의 요청서 한 장 ─────────────────────────────────────────────

function ScenarioCard({
  sc, projectId, open, onToggle,
}: { sc: Scenario; projectId: string; open: boolean; onToggle: () => void }) {
  const router = useRouter();
  const { run } = useNoMeeting();
  const [live, setLive] = useState<Record<string, number | boolean>>(sc.liveData);
  const [busy, setBusy] = useState(false);

  const dirty = JSON.stringify(live) !== JSON.stringify(sc.liveData);

  const start = () => {
    setBusy(true);
    const id = run(sc.id, live);
    router.push(`/p/${projectId}/no-meeting/e/${id}?fresh=1`);
  };

  return (
    <li className="rounded-sm border border-[var(--rule)] bg-white shadow-[0_1px_3px_rgba(20,22,26,.06)]">
      <div className="flex flex-col gap-5 px-5 py-5 sm:flex-row sm:items-start sm:px-7 sm:py-6">
        {/* 예정 시각 — 아직 열리지 않은 회의라는 사실 */}
        <div className="flex shrink-0 flex-row items-baseline gap-3 sm:w-[104px] sm:flex-col sm:items-start sm:gap-1">
          <span className="stencil !text-[10px]">예정</span>
          <span className="tabular text-[15px] font-bold text-[var(--ink)]">{clockLabel(sc.scheduledAt)}</span>
          <span className="tabular text-[12.5px] text-[var(--placeholder)]">{whenLabel(sc.scheduledAt)}</span>
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="text-[21px] font-bold leading-snug sm:text-[23px]">{sc.title}</h3>
          <p className="mt-1.5 text-[15.5px] leading-relaxed text-[var(--ink-soft)]">{sc.description}</p>

          <div className="tabular mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13.5px] text-[var(--ink-faint)]">
            <span>참석 예정 {sc.attendeeCount}명</span>
            <span className="text-[var(--rule)]">|</span>
            <span>{sc.plannedMinutes}분</span>
            <span className="text-[var(--rule)]">|</span>
            <span>안건 {sc.agendaCount}건</span>
            <span className="text-[var(--rule)]">|</span>
            <span className="font-semibold text-[var(--ink)]">{sc.attendeeCount * sc.plannedMinutes} 인시분</span>
            <span className="text-[var(--rule)]">|</span>
            <span>{sc.requestedBy}</span>
          </div>

          <p className="mt-3 inline-block border-l-2 border-[var(--rule)] pl-3 text-[14px] font-semibold text-[var(--placeholder)]">
            {sc.spotlight}
          </p>
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:w-[132px]">
          <button onClick={start} disabled={busy} className={solidBtn}>
            {busy ? '판정 중…' : '판정하기'}
          </button>
          {sc.liveFields.length > 0 && (
            <button onClick={onToggle} className={outlineBtn}>
              {open ? '입력 닫기' : '입력 조정'}
            </button>
          )}
        </div>
      </div>

      {open && sc.liveFields.length > 0 && (
        <div className="border-t border-dashed border-[var(--rule)] bg-[var(--card-tint)] px-5 py-5 sm:px-7">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <span className="stencil">Live Data · 판정 입력</span>
            {dirty && (
              <button
                onClick={() => setLive(sc.liveData)}
                className="text-[13px] font-semibold text-[var(--accent)] hover:underline"
              >
                원래 값으로
              </button>
            )}
          </div>
          <p className="mt-2 text-[14px] leading-snug text-[var(--ink-soft)]">
            여기 있는 값만 바꿀 수 있습니다. 원본 데이터는 수정되지 않고, 이번 판정의 스냅샷에만 반영됩니다.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {sc.liveFields.map((f) => (
              <LiveControl key={f.key} field={f} value={live[f.key]} onChange={(v) => setLive({ ...live, [f.key]: v })} />
            ))}
          </div>
        </div>
      )}
    </li>
  );
}

// ── Live Data 컨트롤 ──────────────────────────────────────────────

export function LiveControl({
  field, value, onChange,
}: {
  field: Scenario['liveFields'][number];
  value: number | boolean | undefined;
  onChange: (v: number | boolean) => void;
}) {
  if (field.kind === 'boolean') {
    const on = value === true;
    return (
      <div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[15px] font-semibold">{field.label}</span>
          <button
            role="switch"
            aria-checked={on}
            onClick={() => onChange(!on)}
            className="tabular inline-flex h-8 items-center rounded-sm border-2 px-3 text-[12px] font-bold uppercase tracking-[0.12em] transition-colors"
            style={{
              color: on ? 'var(--live)' : 'var(--placeholder)',
              borderColor: on ? 'var(--live)' : 'var(--input-border)',
            }}
          >
            {on ? '있음' : '없음'}
          </button>
        </div>
        {field.hint && <p className="mt-1 text-[13px] leading-snug text-[var(--placeholder)]">{field.hint}</p>}
      </div>
    );
  }

  const v = typeof value === 'number' ? value : field.min;
  const decimals = field.step < 1 ? 2 : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[15px] font-semibold">{field.label}</span>
        <span className="tabular text-[15px] font-bold text-[var(--ink)]">
          {v.toFixed(decimals)}
          <span className="ml-1 text-[12.5px] font-medium text-[var(--placeholder)]">{field.unit}</span>
        </span>
      </div>
      <input
        type="range"
        min={field.min}
        max={field.max}
        step={field.step}
        value={v}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={field.label}
        className="mt-2 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-[var(--rule)] accent-[var(--accent)]"
      />
      {field.hint && <p className="mt-1 text-[13px] leading-snug text-[var(--placeholder)]">{field.hint}</p>}
    </div>
  );
}
