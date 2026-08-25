'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { GATE, OUTCOME, OUTCOME_ARTIFACT, TYPE, clockLabel, whenLabel } from '@/lib/no-meeting/labels';
import { CONNECTOR_BY_ID } from '@/lib/no-meeting/mock-data';
import { useNoMeeting } from '@/lib/no-meeting/store';
import type { Evaluation } from '@/lib/no-meeting/types';
import {
  BackLink, DotLine, EvidenceLine, GateRow, TypeChip, VerdictStamp, outlineBtn, solidBtn,
} from './atoms';
import { LiveControl } from './today';

/**
 * S-002 · 판정 상세
 *
 * 이 화면이 하는 일은 결론을 보여주는 게 아니라 결론에 이른 경로를 보여주는 것이다.
 * 유형 → 근거 → 조건 → 결과 순서로, 각 단계가 앞 단계를 근거로 삼는다.
 * 순서를 눈으로 볼 수 있어야 "왜 없앴냐"는 질문에 답이 된다.
 */

type Stage = 0 | 1 | 2 | 3;

const STAGES = [
  { n: '01', label: '유형 판정', ms: 900 },
  { n: '02', label: '근거 수집', ms: 550 },
  { n: '03', label: '조건 검사', ms: 900 },
  { n: '04', label: '판정', ms: 0 },
] as const;

export function EvaluationDetail({ projectId, evaluationId }: { projectId: string; evaluationId: string }) {
  const { evaluationOf, scenarioOf, run } = useNoMeeting();
  const search = useSearchParams();
  const fresh = search.get('fresh') === '1';

  const ev = evaluationOf(evaluationId);
  const [stage, setStage] = useState<Stage>(fresh ? 0 : 3);

  useEffect(() => {
    if (!fresh || !ev) return;
    let s = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let acc = 0;
    for (const st of STAGES) {
      if (st.ms === 0) break;
      acc += st.ms;
      const next = (s + 1) as Stage;
      s = next;
      timers.push(setTimeout(() => setStage(next), acc));
    }
    return () => timers.forEach(clearTimeout);
  }, [fresh, ev]);

  if (!ev) {
    return (
      <div className="mx-auto max-w-[1080px] px-5 py-20 text-center sm:px-10">
        <span className="stamp px-4 py-1.5 text-[13px] font-bold">not found</span>
        <p className="mt-5 text-[18px]">이 판정을 찾을 수 없습니다.</p>
        <p className="mt-2 text-[15px] text-[var(--ink-soft)]">
          목업 단계라 판정은 브라우저 탭에만 남습니다. 탭을 새로 열면 초기화됩니다.
        </p>
        <Link href={`/p/${projectId}/no-meeting`} className={`${outlineBtn} mt-6`}>오늘로 돌아가기</Link>
      </div>
    );
  }

  const sc = scenarioOf(ev.scenarioId);
  const passed = ev.gateChecks.filter((g) => g.status === 'PASS').length;
  const applicable = ev.gateChecks.filter((g) => g.status !== 'NOT_APPLICABLE').length;

  return (
    <div>
      {/* ── 히어로 ─────────────────────────────────────────────── */}
      <section className="grid-paper bg-[var(--navy)] text-white">
        <div className="mx-auto max-w-[1080px] px-5 py-9 sm:px-10 sm:py-11">
          <div className="flex flex-wrap items-center gap-2 text-[14px] font-medium text-[var(--navy-ink-faint)]">
            <Link href={`/p/${projectId}/no-meeting`} className="hover:text-white">NO MEETING</Link>
            <span className="text-[var(--navy-divider)]">/</span>
            <span className="font-semibold text-white">판정 상세</span>
          </div>

          <h1 className="relative mt-5 inline-block text-[30px] font-bold leading-tight tracking-tight sm:text-[38px]">
            <span className={stage >= 3 && ev.outcome === 'DELETE' ? 'strike-sweep relative opacity-60' : ''}>
              {ev.title}
            </span>
          </h1>

          <div className="tabular mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[14px] text-[var(--navy-ink-faint)]">
            <span>예정 {clockLabel(ev.scheduledAt)}</span>
            <span className="text-[var(--navy-divider)]">|</span>
            <span>판정 {whenLabel(ev.requestedAt)}</span>
            <span className="text-[var(--navy-divider)]">|</span>
            <span>규칙 {ev.ruleVersion}</span>
          </div>
        </div>
      </section>

      <div className="mx-auto w-full max-w-[1080px] px-5 py-9 sm:px-10">
        <BackLink href={`/p/${projectId}/no-meeting`}>← 오늘로</BackLink>

        <div className="mt-7 grid gap-10 lg:grid-cols-[1fr_312px] lg:items-start">
          {/* ── 판정 레일 ───────────────────────────────────────── */}
          <div className="min-w-0">
            {/* 01 유형 */}
            <Step index={0} stage={stage}>
              {stage < 1 ? (
                <Scanning text="8종 taxonomy 대조 중" />
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-3">
                    <TypeChip type={ev.meetingType} />
                    <span className="text-[14px] text-[var(--placeholder)]">{TYPE[ev.meetingType].note}</span>
                  </div>
                  <p className="mt-3 text-[16px] leading-relaxed text-[var(--ink-soft)]">{ev.typeRationale}</p>

                  {ev.typeCandidates.length > 1 && (
                    <ul className="mt-4 space-y-2">
                      {ev.typeCandidates.map((c, i) => (
                        <li key={c.type} className="flex items-center gap-3">
                          <span className="tabular w-[26px] shrink-0 text-[12px] font-semibold text-[var(--placeholder)]">
                            {TYPE[c.type].code}
                          </span>
                          <span className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--rule)]">
                            <span
                              className="block h-full rounded-full transition-[width] duration-700"
                              style={{
                                width: `${Math.round(c.score * 100)}%`,
                                background: i === 0 && ev.meetingType !== 'UNCLASSIFIED' ? 'var(--ink)' : 'var(--rule-soft)',
                                backgroundColor: i === 0 && ev.meetingType !== 'UNCLASSIFIED' ? 'var(--ink)' : '#c9ced6',
                              }}
                            />
                          </span>
                          <span className="tabular w-[46px] shrink-0 text-right text-[13px] font-semibold">
                            {c.score.toFixed(2)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}

                  <p className="mt-3 text-[13.5px] leading-snug text-[var(--placeholder)]">
                    점수는 확률이 아니라 후보 비교용 가설 점수입니다. 1·2위 차가 0.20 미만이면 확정하지 않습니다.
                  </p>

                  {ev.meetingType === 'UNCLASSIFIED' && (
                    <div className="mt-5 rounded-sm border-2 border-dashed border-[var(--input-border)] bg-[var(--card-tint)] px-5 py-5">
                      <span className="stencil">확인 질문</span>
                      <p className="mt-2 text-[19px] font-bold leading-snug">{ev.clarificationQuestion}</p>
                      <p className="mt-2 text-[15px] leading-relaxed text-[var(--ink-soft)]">
                        후보 두 개의 점수가 너무 가깝습니다. 여기서 하나를 고르면 그 뒤의 모든 판정이 틀린 전제 위에 서게 됩니다.
                        그래서 추측하지 않고 되묻습니다.
                      </p>
                    </div>
                  )}
                </>
              )}
            </Step>

            {/* 02 근거 */}
            <Step index={1} stage={stage}>
              {stage < 2 ? (
                <Scanning text="TeamSync · Jira · CI 스냅샷 생성 중" />
              ) : ev.evidence.length === 0 ? (
                <p className="text-[15.5px] text-[var(--ink-soft)]">
                  이 유형은 근거를 읽지 않습니다. 수집한 항목이 없습니다.
                </p>
              ) : (
                <>
                  <p className="text-[15px] leading-relaxed text-[var(--ink-soft)]">
                    판정 시점의 사본입니다. 원본이 나중에 바뀌어도 이 판정은 이 값으로 남습니다.
                  </p>
                  <ul className="mt-3 space-y-1.5">
                    {ev.evidence.map((e) => <EvidenceLine key={e.id} e={e} at={ev.requestedAt} />)}
                  </ul>

                  {ev.droppedSources.length > 0 && (
                    <div className="mt-4 border-l-2 border-[var(--verdict-shrink)] py-1 pl-3">
                      <p className="text-[14.5px] leading-snug text-[var(--ink-soft)]">
                        <strong className="text-[var(--ink)]">
                          {ev.droppedSources.map((id) => CONNECTOR_BY_ID[id].name).join(' · ')}
                        </strong>
                        은 연결되어 있지 않아 읽지 못했습니다. 그 소스가 공급하던 조건은 추측하지 않고
                        확인 불가로 남깁니다.
                      </p>
                      <Link
                        href={`/p/${projectId}/no-meeting/connections`}
                        className="mt-1 inline-block text-[14px] font-semibold text-[var(--accent)]"
                      >
                        연결 화면 열기 →
                      </Link>
                    </div>
                  )}
                </>
              )}
            </Step>

            {/* 03 게이트 */}
            <Step index={2} stage={stage}>
              {stage < 3 ? (
                <Scanning text={`조건 ${ev.gateChecks.length}개 검사 중`} />
              ) : ev.gateChecks.length === 0 ? (
                <p className="text-[15.5px] text-[var(--ink-soft)]">
                  유형을 확정하지 못했으므로 조건을 검사하지 않았습니다.
                </p>
              ) : (
                <>
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <span className="text-[15px] text-[var(--ink-soft)]">
                      {applicable === 0
                        ? '이 유형에는 조건을 적용하지 않습니다.'
                        : '각 조건은 계산 가능한 값으로만 판정합니다. 진행률을 추정하지 않습니다.'}
                    </span>
                    {applicable > 0 && (
                      <span className="tabular text-[15px] font-bold">{passed} / {applicable} 충족</span>
                    )}
                  </div>
                  <ul className="mt-3 border-t border-[var(--rule)]">
                    {ev.gateChecks.map((g, i) => (
                      <GateRow key={g.key} gate={g} index={i} evidence={ev.evidence} at={ev.requestedAt} />
                    ))}
                  </ul>
                </>
              )}
            </Step>

            {/* 04 결과 */}
            <Step index={3} stage={stage} last>
              {stage < 3 ? (
                <Scanning text="판정 대기" />
              ) : ev.outcome === null ? (
                <div className="rounded-sm border-2 border-dashed border-[var(--input-border)] px-6 py-7 text-center">
                  <span className="tabular rounded-sm border-2 border-[var(--placeholder)] px-4 py-1.5 text-[14px] font-bold uppercase tracking-[0.16em] text-[var(--placeholder)]">
                    판정 보류
                  </span>
                  <p className="mt-4 text-[17px] leading-relaxed text-[var(--ink-soft)]">
                    유형을 확정하지 못했습니다. 결과도, 산출물도 만들지 않았습니다.
                    <br />
                    <strong className="text-[var(--ink)]">추측한 결론보다 없는 결론이 낫습니다.</strong>
                  </p>
                </div>
              ) : (
                <Verdict ev={ev} projectId={projectId} />
              )}
            </Step>
          </div>

          {/* ── Live Data 사이드 ────────────────────────────────── */}
          <aside className="lg:sticky lg:top-24">
            {sc && sc.liveFields.length > 0 ? (
              <ReRunPanel projectId={projectId} ev={ev} scenarioId={sc.id} fields={sc.liveFields} onRun={run} />
            ) : (
              <div className="rounded-sm border border-dashed border-[var(--rule)] bg-[var(--card-tint)] px-5 py-5">
                <span className="stencil">Live Data</span>
                <p className="mt-2 text-[14.5px] leading-relaxed text-[var(--ink-soft)]">
                  이 시나리오에는 조정할 입력이 없습니다. 유형만으로 경로가 정해지기 때문입니다.
                </p>
              </div>
            )}

            <div className="mt-5 rounded-sm border border-[var(--rule)] px-5 py-5">
              <span className="stencil">판정 원본</span>
              <div className="mt-2 text-[14.5px]">
                <DotLine label="규칙 버전" value={ev.ruleVersion} />
                <DotLine label="스냅샷" value={clockLabel(ev.requestedAt)} />
                <DotLine label="근거" value={`${ev.evidence.length}건`} />
                {ev.droppedSources.length > 0 && (
                  <DotLine label="못 읽은 소스" value={`${ev.droppedSources.length}곳`} />
                )}
                <DotLine label="조건" value={`${passed}/${applicable || '—'}`} />
              </div>
              <Link
                href={`/p/${projectId}/no-meeting/ledger`}
                className="mt-4 inline-block text-[14px] font-semibold text-[var(--accent)]"
              >
                원장에서 이 판정 보기 →
              </Link>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

// ── 단계 껍데기 ───────────────────────────────────────────────────

function Step({
  index, stage, last = false, children,
}: { index: number; stage: Stage; last?: boolean; children: React.ReactNode }) {
  const st = STAGES[index];
  const active = stage === index;
  const done = stage > index;
  const reached = active || done;

  return (
    <section className={`relative pl-11 ${last ? 'pb-0' : 'pb-9'} sm:pl-14`}>
      {/* 세로 괘선 — 단계가 앞 단계 위에 서 있다는 표시 */}
      {!last && (
        <span
          aria-hidden
          className="absolute left-[13px] top-9 bottom-0 w-px sm:left-[17px]"
          style={{ background: done ? 'var(--ink)' : 'var(--rule)' }}
        />
      )}
      <span
        aria-hidden
        className="tabular absolute left-0 top-0 flex h-[27px] w-[27px] items-center justify-center rounded-full border-2 text-[11px] font-bold sm:h-[35px] sm:w-[35px] sm:text-[12px]"
        style={{
          borderColor: reached ? 'var(--ink)' : 'var(--rule)',
          background: done ? 'var(--ink)' : 'var(--paper)',
          color: done ? '#fff' : reached ? 'var(--ink)' : 'var(--placeholder)',
        }}
      >
        {st.n}
      </span>

      <h2 className={`text-[13px] font-semibold uppercase tracking-[0.16em] ${reached ? 'text-[var(--ink)]' : 'text-[var(--placeholder)]'} font-[family-name:var(--font-receipt-mono)]`}>
        {st.label}
      </h2>
      <div className="mt-3.5">{children}</div>
    </section>
  );
}

function Scanning({ text }: { text: string }) {
  return (
    <div className="rounded-sm border border-[var(--rule)] bg-[var(--card-tint)] px-5 py-4">
      <div className="flex items-center gap-3">
        <span className="live-dot block h-2 w-2 rounded-full bg-[var(--accent)]" />
        <span className="text-[15px] font-semibold text-[var(--ink-soft)]">{text}</span>
      </div>
      <span aria-hidden className="mt-3 block h-[2px] w-full overflow-hidden bg-[var(--rule)]">
        <span className="scan-sweep block h-full w-1/3 bg-[var(--accent)]" />
      </span>
    </div>
  );
}

// ── 결과 ──────────────────────────────────────────────────────────

function Verdict({ ev, projectId }: { ev: Evaluation; projectId: string }) {
  const outcome = ev.outcome!;
  const o = OUTCOME[outcome];
  const art = ev.artifact;

  return (
    <div>
      <div className="rounded-sm border-2 px-6 py-7 sm:px-8" style={{ borderColor: o.ink }}>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-4">
          <VerdictStamp outcome={outcome} size="lg" drop />
          <p className="min-w-0 flex-1 text-[16.5px] leading-relaxed text-[var(--ink-soft)]">{o.blurb}</p>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-dashed border-[var(--rule)] pt-5">
          <span className="stencil">산출물</span>
          <span className="text-[16px] font-bold">{OUTCOME_ARTIFACT[outcome]}</span>
        </div>
      </div>

      {/* 해결 로그는 이 화면 안에서 끝난다. 다른 화면으로 보내면 그게 또 하나의 일이 된다. */}
      {art?.type === 'RESOLUTION_LOG' && <ResolutionLog ev={ev} content={art.content} />}

      {art?.type === 'DECISION_CARD' && (
        <ArtifactLink
          href={`/p/${projectId}/no-meeting/e/${ev.id}/decision`}
          tone="var(--verdict-decide)"
          title={art.content.question}
          note={
            ev.decisionStatus === 'DECIDED' ? '결정 완료 — 선택과 근거가 원장에 남았습니다.'
            : ev.decisionStatus === 'REVERTED' ? '되돌림 — 사유가 원장에 남았습니다.'
            : `${art.content.deciderRole}에게 올라갔습니다. 30초면 됩니다.`
          }
          cta={ev.decisionStatus === 'PENDING' ? '결정 카드 열기' : '결정 카드 보기'}
        />
      )}

      {art?.type === 'MEETING_PRESCRIPTION' && (
        <ArtifactLink
          href={`/p/${projectId}/no-meeting/e/${ev.id}/prescription`}
          tone={OUTCOME[outcome].ink}
          title={art.content.purpose}
          note={
            art.content.attendees.length > 0
              ? `${art.content.originalAttendeeCount}명 → ${art.content.attendees.filter((a) => a.included).length}명 · ${art.content.originalMinutes}분 → ${art.content.agendas.reduce((s, a) => s + a.minutes, 0)}분`
              : '참석자·안건을 조정하지 않습니다.'
          }
          cta="회의 처방전 열기"
        />
      )}
    </div>
  );
}

function ArtifactLink({
  href, tone, title, note, cta,
}: { href: string; tone: string; title: string; note: string; cta: string }) {
  return (
    <Link
      href={href}
      className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-sm border border-[var(--rule)] border-l-[3px] bg-white px-6 py-5 transition-colors hover:bg-[var(--card-tint)] hover:no-underline"
      style={{ borderLeftColor: tone }}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[18px] font-bold leading-snug text-[var(--ink)]">{title}</span>
        <span className="mt-1 block text-[14.5px] text-[var(--ink-faint)]">{note}</span>
      </span>
      <span className="shrink-0 text-[15px] font-semibold" style={{ color: tone }}>{cta} →</span>
    </Link>
  );
}

// ── 해결 로그 ─────────────────────────────────────────────────────

function ResolutionLog({
  ev, content,
}: { ev: Evaluation; content: Extract<Evaluation['artifact'], { type: 'RESOLUTION_LOG' }>['content'] }) {
  const total = content.savedPeople * content.savedMinutes;
  return (
    <article className="roll mt-4 px-6 py-6 sm:px-8 sm:py-7">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b-2 border-[var(--ink)] pb-3">
        <h3 className="text-[20px] font-bold">해결 로그</h3>
        <span className="tabular text-[13px] text-[var(--placeholder)]">{clockLabel(ev.requestedAt)}</span>
      </div>

      <p className="mt-4 text-[17px] leading-relaxed">{content.summary}</p>

      {content.resolvedByData.length > 0 && (
        <section className="mt-6">
          <span className="stencil">데이터로 확정 · {content.resolvedByData.length}건</span>
          <ul className="mt-2.5 space-y-1.5">
            {content.resolvedByData.map((t) => (
              <li key={t} className="flex gap-2.5 text-[15.5px] leading-snug">
                <span className="mt-[3px] shrink-0 text-[13px] font-bold text-[var(--live)]">✓</span>
                <span className="text-[var(--ink-soft)]">{t}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {content.resolvedByPolicy.length > 0 && (
        <section className="mt-5">
          <span className="stencil">정책으로 판정 · {content.resolvedByPolicy.length}건</span>
          <ul className="mt-2.5 space-y-1.5">
            {content.resolvedByPolicy.map((t) => (
              <li key={t} className="flex gap-2.5 text-[15.5px] leading-snug">
                <span className="mt-[3px] shrink-0 text-[13px] font-bold text-[var(--accent)]">§</span>
                <span className="text-[var(--ink-soft)]">{t}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <hr className="rule-dash my-6" />

      <div className="text-[16px]">
        <DotLine label="참석 예정" value={`${content.savedPeople}명 × ${content.savedMinutes}분`} />
        <DotLine label="절약" value={`${total.toLocaleString('ko-KR')} 인시분`} strong />
      </div>

      <p className="mt-5 rounded-sm bg-[var(--card-tint)] px-4 py-3 text-[14.5px] leading-relaxed text-[var(--ink-soft)]">
        회의는 {content.savedPeople}명이 {content.savedPeople}명분을 다 들어야 하지만,
        이 로그는 각자 자기에게 필요한 줄만 봅니다.
      </p>

      <p className="mt-4 text-[14.5px] leading-snug text-[var(--placeholder)]">
        다시 확인할 조건 · {content.followUpCondition}
      </p>
    </article>
  );
}

// ── 재판정 패널 ───────────────────────────────────────────────────

function ReRunPanel({
  projectId, ev, scenarioId, fields, onRun,
}: {
  projectId: string;
  ev: Evaluation;
  scenarioId: string;
  fields: NonNullable<ReturnType<ReturnType<typeof useNoMeeting>['scenarioOf']>>['liveFields'];
  onRun: (scenarioId: string, live: Record<string, number | boolean>) => string;
}) {
  const router = useRouter();
  const [live, setLive] = useState<Record<string, number | boolean>>(ev.liveData);
  const dirty = JSON.stringify(live) !== JSON.stringify(ev.liveData);

  return (
    <div className="rounded-sm border border-[var(--rule)] bg-white px-5 py-5 shadow-[0_1px_3px_rgba(20,22,26,.06)]">
      <span className="stencil">Live Data</span>
      <p className="mt-2 text-[14px] leading-relaxed text-[var(--ink-soft)]">
        값을 바꾸고 다시 판정해 보세요. 기존 판정은 지우지 않고 새 판정이 하나 더 생깁니다.
      </p>

      <div className="mt-4 space-y-4">
        {fields.map((f) => (
          <LiveControl key={f.key} field={f} value={live[f.key]} onChange={(v) => setLive({ ...live, [f.key]: v })} />
        ))}
      </div>

      <button
        disabled={!dirty}
        onClick={() => {
          const id = onRun(scenarioId, live);
          router.push(`/p/${projectId}/no-meeting/e/${id}?fresh=1`);
        }}
        className={`${solidBtn} mt-5 w-full`}
      >
        {dirty ? '이 입력으로 다시 판정' : '값을 바꾸면 활성화'}
      </button>

      {dirty && (
        <button
          onClick={() => setLive(ev.liveData)}
          className="mt-2 w-full text-[13.5px] font-semibold text-[var(--placeholder)] hover:text-[var(--ink)]"
        >
          이번 판정 값으로 되돌리기
        </button>
      )}

      <p className="mt-4 border-t border-dashed border-[var(--rule)] pt-3 text-[13px] leading-snug text-[var(--placeholder)]">
        같은 입력 + 같은 규칙 버전은 항상 같은 결과를 냅니다. {GATE.UNKNOWN.mark} 가 하나라도 있으면 삭제하지 않습니다.
      </p>
    </div>
  );
}
