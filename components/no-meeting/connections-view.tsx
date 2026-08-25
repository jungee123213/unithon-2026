'use client';

import Link from 'next/link';
import { useState } from 'react';
import { clockLabel, whenLabel } from '@/lib/no-meeting/labels';
import { disconnectConnector, setConnection } from '@/app/p/[projectId]/no-meeting/actions';
import { ConnectorConnect, type ConnectorPublic } from './connector-connect';
import { CONNECTORS } from '@/lib/no-meeting/connectors';
import type { ConnectionState, Connector, ConnectorId } from '@/lib/no-meeting/types';
import { BackLink, SectionHead, outlineBtn, solidBtn } from './atoms';

/**
 * S-006 · 연결
 *
 * 이 제품은 스스로 아는 사실이 하나도 없다. 전부 남의 시스템에서 읽는다.
 * 그래서 이 화면은 설정 화면이 아니라 **판정의 사정거리를 정하는 화면**이다.
 * 무엇이 연결됐는지가 곧 무엇을 판정할 수 있는지고, 끊긴 소스의 조건은
 * FAIL 이 아니라 UNKNOWN 이 되며 — UNKNOWN 이 하나라도 있으면 회의를 삭제하지 않는다.
 */
/** 자격증명을 받는 커넥터. 나머지는 아직 목업 동의 화면을 쓴다. */
const CREDENTIAL_CONNECTORS = new Set<ConnectorId>(['jira', 'alerts']);

export function ConnectionsView({
  projectId, connections, configs, members,
}: {
  projectId: string;
  connections: Record<ConnectorId, ConnectionState>;
  /** 저장된 커넥터 설정 — **토큰은 여기 없다** (`publicView` 로 깎아서 온다). */
  configs: Partial<Record<ConnectorId, ConnectorPublic>>;
  members: string[];
}) {

  const [pending, setPending] = useState<Connector | null>(null);

  const on = CONNECTORS.filter((c) => connections[c.id].status === 'CONNECTED');
  const off = CONNECTORS.filter((c) => connections[c.id].status === 'DISCONNECTED');
  const missingRequired = off.filter((c) => c.required);

  return (
    <div>
      <section className="grid-paper bg-[var(--navy)] text-white">
        <div className="mx-auto max-w-[1000px] px-5 py-9 sm:px-10 sm:py-11">
          <div className="flex flex-wrap items-center gap-2 text-[14px] font-medium text-[var(--navy-ink-faint)]">
            <Link href={`/p/${projectId}/no-meeting`} className="hover:text-white">NO MEETING</Link>
            <span className="text-[var(--navy-divider)]">/</span>
            <span className="font-semibold text-white">연결</span>
          </div>

          <h1 className="mt-5 text-[32px] font-bold leading-tight tracking-tight sm:text-[40px]">연결</h1>
          <p className="mt-3 max-w-[64ch] text-[17px] leading-relaxed text-[var(--navy-ink-soft)]">
            이 제품은 스스로 아는 사실이 하나도 없습니다. 전부 여기 연결된 곳에서 읽어옵니다.
            <strong className="text-white"> 무엇이 연결됐는지가 무엇을 판정할 수 있는지를 정합니다.</strong>
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-x-8 gap-y-3">
            <span className="tabular text-[15px] text-[var(--navy-ink-faint)]">
              연결됨 <strong className="ml-1 text-[20px] text-white">{on.length}</strong>
              <span className="mx-1.5 text-[var(--navy-divider)]">/</span>
              {CONNECTORS.length}
            </span>
            {off.length > 0 && (
              <span className="text-[15px] text-[var(--navy-ink-faint)]">
                끊긴 소스가 공급하던 조건은 <strong className="text-white">확인 불가</strong>로 처리됩니다.
              </span>
            )}
          </div>
        </div>
      </section>

      <div className="mx-auto w-full max-w-[1000px] px-5 py-9 sm:px-10">
        <BackLink href={`/p/${projectId}/no-meeting`}>← 오늘로</BackLink>

        {missingRequired.length > 0 && (
          <div className="mt-6 rounded-sm border-2 border-[var(--stamp)] bg-[#fdf6f4] px-5 py-4 sm:px-6">
            <span className="stencil !text-[var(--stamp)]">필수 소스 없음</span>
            <p className="mt-1.5 text-[16px] leading-snug">
              {missingRequired.map((c) => c.name).join(' · ')}가 연결되어 있지 않습니다.
              판정할 회의 요청이 들어오지 않습니다.
            </p>
          </div>
        )}

        <div className="mt-7">
          <SectionHead count={`${CONNECTORS.length}곳`}>데이터 소스</SectionHead>
          <ul className="mt-5 space-y-4">
            {CONNECTORS.map((c) => (
              <ConnectorCard
                key={c.id}
                projectId={projectId}
                c={c}
                state={connections[c.id]}
                demo={CREDENTIAL_CONNECTORS.has(c.id)
                  && connections[c.id].status === 'CONNECTED' && !configs[c.id]}
                onConnect={() => setPending(c)}
              />
            ))}
          </ul>
        </div>

        {/* 이 제품이 남의 시스템에 무엇을 하지 않는지 */}
        <section className="mt-12 rounded-sm border border-[var(--rule)] px-5 py-5 sm:px-6">
          <span className="stencil">읽기 전용</span>
          <p className="mt-2 text-[16px] leading-relaxed text-[var(--ink-soft)]">
            연결된 어느 곳에도 쓰지 않습니다. 일정을 만들거나 지우지 않고, 이슈 상태를 바꾸지 않고,
            배포하지 않습니다. 판정과 외부 실행은 분리되어 있습니다 —
            실행에는 승인·권한·복구 설계가 따로 필요하고, 그건 이 화면의 일이 아닙니다.
          </p>
        </section>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link href={`/p/${projectId}/no-meeting`} className={outlineBtn}>오늘</Link>
          <Link href={`/p/${projectId}/no-meeting/ledger`} className={outlineBtn}>결정 원장</Link>
        </div>
      </div>

      {pending && CREDENTIAL_CONNECTORS.has(pending.id) ? (
        <ConnectorConnect
          projectId={projectId}
          connectorId={pending.id as 'jira' | 'alerts'}
          current={configs[pending.id] ?? null}
          members={members}
          onClose={() => setPending(null)}
        />
      ) : pending ? (
        <ConsentDialog projectId={projectId} c={pending} onClose={() => setPending(null)} />
      ) : null}
    </div>
  );
}

// ── 커넥터 한 장 ──────────────────────────────────────────────────

function ConnectorCard({
  projectId, c, state, onConnect, demo = false,
}: {
  projectId: string; c: Connector; state: ConnectionState; onConnect: () => void;
  /**
   * 연결됐다고 표시돼 있지만 자격증명이 없는 상태.
   * 정상 경로에서는 안 생긴다(연결 해제하면 자격증명도 지운다). 그래도 화면에 밝히는 것은,
   * 이 상태가 이 제품에서 가장 나쁜 상태이기 때문이다 — 사람은 시스템이 봤다고 믿는데
   * 실제로는 아무것도 안 봤고, 판정문에는 "확인 불가" 로만 적힌다.
   */
  demo?: boolean;
}) {
  const live = state.status === 'CONNECTED';

  return (
    <li
      className="rounded-sm border bg-white px-5 py-5 sm:px-7 sm:py-6"
      style={{ borderColor: live ? 'var(--rule)' : c.required ? 'var(--stamp)' : 'var(--input-border)' }}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h3 className="text-[20px] font-bold">{c.name}</h3>
            <span className="tabular text-[13px] text-[var(--placeholder)]">{c.vendor}</span>
            <StatusPill live={live} required={c.required} />
          </div>

          <p className="mt-2 text-[15.5px] leading-relaxed text-[var(--ink-soft)]">{c.role}</p>

          {demo && (
            <p className="mt-2.5 border-l-2 border-[var(--stamp)] pl-3 text-[14.5px] leading-snug text-[var(--ink-soft)]">
              <strong className="text-[var(--ink)]">연결됨으로 표시돼 있지만 자격증명이 없습니다.</strong>{' '}
              읽어 오는 근거가 0건이라 이 소스가 공급하던 조건은 전부 확인 불가가 됩니다.
              다시 연결해주세요.
            </p>
          )}
          {live ? (
            <p className="tabular mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13.5px] text-[var(--ink-faint)]">
              <span className="font-[family-name:var(--font-receipt-kr)] font-semibold">{state.accountLabel}</span>
              {state.lastSyncAt && (
                <>
                  <span className="text-[var(--rule)]">|</span>
                  <span>마지막 동기화 {whenLabel(state.lastSyncAt)}</span>
                </>
              )}
              {state.connectedAt && (
                <>
                  <span className="text-[var(--rule)]">|</span>
                  <span>연결 {clockLabel(state.connectedAt)}</span>
                </>
              )}
            </p>
          ) : (
            <p className="mt-2.5 border-l-2 border-[var(--input-border)] pl-3 text-[14.5px] leading-snug text-[var(--placeholder)]">
              연결되어 있지 않습니다. 아래 조건은 값을 읽을 수 없어 <strong className="text-[var(--verdict-shrink)]">확인 불가</strong>로 남습니다.
            </p>
          )}
        </div>

        <div className="shrink-0 sm:w-[124px]">
          {live ? (
            c.id === 'teamsync' ? (
              <span className="block text-center text-[13.5px] leading-snug text-[var(--placeholder)]">
                이 앱의 데이터라 끊을 수 없습니다
              </span>
            ) : (
              <div className="space-y-2">
                {CREDENTIAL_CONNECTORS.has(c.id) && (
                  <button onClick={onConnect} className={`${outlineBtn} w-full`}>설정 · 사람 매핑</button>
                )}
                <button
                  onClick={() => { void disconnectConnector(projectId, c.id); }}
                  className={`${outlineBtn} w-full`}
                >
                  연결 해제
                </button>
              </div>
            )
          ) : (
            <button onClick={onConnect} className={`${solidBtn} w-full`}>연결하기</button>
          )}
        </div>
      </div>

      {/* 무엇을 읽고, 무엇에 쓰이는가 */}
      <div className="mt-5 grid gap-5 border-t border-dashed border-[var(--rule)] pt-4 sm:grid-cols-2">
        <div>
          <span className="stencil !text-[10px]">읽는 것</span>
          <ul className="mt-2 space-y-1">
            {c.reads.map((r) => (
              <li key={r} className="flex gap-2 text-[14.5px] leading-snug text-[var(--ink-soft)]">
                <span className="shrink-0 text-[var(--placeholder)]">·</span><span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <span className="stencil !text-[10px]">공급하는 것</span>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {c.supplies.map((g) => (
              <li
                key={g}
                className="rounded-sm border px-2 py-0.5 text-[13px] font-semibold"
                style={{
                  borderColor: live ? 'var(--rule)' : 'var(--input-border)',
                  color: live ? 'var(--ink-soft)' : 'var(--placeholder)',
                  background: live ? 'var(--card-tint)' : 'transparent',
                  textDecoration: live ? 'none' : 'line-through',
                }}
              >
                {g}
              </li>
            ))}
          </ul>
          <p className="mt-2.5 text-[13px] leading-snug text-[var(--placeholder)]">{c.neverWrites}</p>
        </div>
      </div>
    </li>
  );
}

function StatusPill({ live, required }: { live: boolean; required: boolean }) {
  const ink = live ? 'var(--live)' : required ? 'var(--stamp)' : 'var(--placeholder)';
  return (
    <span
      className="tabular inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.14em]"
      style={{ color: ink, borderColor: ink }}
    >
      {live && <span className="live-dot block h-1.5 w-1.5 rounded-full" style={{ background: ink }} />}
      {live ? 'connected' : required ? 'required' : 'not connected'}
    </span>
  );
}

// ── 목업 OAuth 동의 ───────────────────────────────────────────────

function ConsentDialog({
  projectId, c, onClose,
}: { projectId: string; c: Connector; onClose: () => void }) {
  const [account, setAccount] = useState(defaultAccount(c));

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-[rgba(16,24,35,.45)] p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${c.vendor} 연결`}
        className="card-drop w-full max-w-[480px] rounded-sm border border-[var(--rule)] bg-white px-6 py-6 shadow-[0_10px_40px_rgba(20,22,26,.28)] sm:px-8 sm:py-7"
      >
        <span className="stencil">{c.vendor}</span>
        <h2 className="mt-2 text-[23px] font-bold leading-snug">
          NO MEETING 이 {c.name}에 접근하도록 허용할까요?
        </h2>

        <div className="mt-5">
          <span className="stencil !text-[10px]">요청하는 권한</span>
          <ul className="mt-2 space-y-1.5">
            {c.scopes.map((s) => (
              <li key={s} className="flex gap-2.5 text-[15.5px] leading-snug">
                <span className="shrink-0 font-bold text-[var(--live)]">✓</span>
                <span className="text-[var(--ink-soft)]">{s}</span>
              </li>
            ))}
            <li className="flex gap-2.5 text-[15.5px] leading-snug">
              <span className="shrink-0 font-bold text-[var(--placeholder)]">✕</span>
              <span className="text-[var(--placeholder)]">{c.neverWrites}</span>
            </li>
          </ul>
        </div>

        <label className="mt-5 block">
          <span className="stencil !text-[10px]">연결할 계정</span>
          <input
            value={account}
            onChange={(e) => setAccount(e.target.value)}
            className="mt-1.5 h-11 w-full rounded-sm border border-[var(--input-border)] px-3.5 text-[15.5px] outline-none focus:border-[var(--ink)]"
          />
        </label>

        <p className="mt-4 rounded-sm bg-[var(--card-tint)] px-4 py-3 text-[13.5px] leading-relaxed text-[var(--placeholder)]">
          {c.live
            ? '이미 이 앱의 데이터라 별도 인증이 없습니다. 연결하면 다음 판정부터 이 소스의 근거가 들어옵니다.'
            : '이 커넥터는 아직 실물이 붙어 있지 않습니다. 허용하면 연결된 것으로 처리되고, 판정에는 데모 근거가 들어옵니다.'}
        </p>

        <div className="mt-5 flex flex-wrap justify-end gap-2.5">
          <button onClick={onClose} className={outlineBtn}>취소</button>
          <button
            disabled={account.trim().length === 0}
            onClick={() => { void setConnection(projectId, c.id, true, account.trim()); onClose(); }}
            className={solidBtn}
          >
            허용하고 연결
          </button>
        </div>
      </div>
    </div>
  );
}

function defaultAccount(c: Connector): string {
  switch (c.id) {
    case 'jira': return 'COMMERCE 프로젝트';
    case 'alerts': return '#incident · commerce-api';
    default: return 'unithon';
  }
}
