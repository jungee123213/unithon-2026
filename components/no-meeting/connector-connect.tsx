'use client';

import { useActionState, useState } from 'react';
import {
  connectJira, connectSentry, saveJiraIdentities, saveSentryIdentities,
  type ConnectorConnectState,
} from '@/app/p/[projectId]/no-meeting/actions';
import type { ConnectorId } from '@/lib/no-meeting/types';
import { outlineBtn, solidBtn } from './atoms';

/**
 * 자격증명을 받는 화면 — Jira · Sentry 가 같은 틀을 쓴다.
 *
 * 두 단계로 나눠 놓았고 **둘째 단계를 건너뛸 수 없게** 만든 것이 요점이다.
 * 토큰만 맞으면 연결은 되지만, 사람 이름이 안 맞으면 "부른 사람이 최근에 건드린 것"
 * 으로 근거를 붙이는 길이 통째로 막힌다. 그때 화면에 뜨는 것은 "확인 불가" 뿐이라
 * 원인을 아무도 못 찾는다. 그래서 매핑을 연결 흐름 안에 붙여 둔다.
 */

export type ConnectorPublic = {
  identityMap: Record<string, string>;
  hasToken: boolean;
  /** 폼에 다시 채워 넣을 값들 (비밀 제외) */
  defaults: Record<string, string>;
} | null;

type FieldSpec = {
  name: string;
  label: string;
  placeholder?: string;
  hint?: string;
  type?: string;
  required?: boolean;
  /** 이미 저장돼 있으면 라벨을 바꾼다 — 다시 붙여넣어야 바뀐다는 사실을 알려야 한다. */
  secret?: boolean;
};

const SPECS: Record<'jira' | 'alerts', {
  vendor: string;
  title: string;
  intro: string;
  tokenNote: string;
  fields: FieldSpec[];
  connect: (projectId: string, prev: ConnectorConnectState, form: FormData) => Promise<ConnectorConnectState>;
  saveIdentities: (projectId: string, form: FormData) => Promise<void>;
}> = {
  jira: {
    vendor: 'Atlassian Jira',
    title: '이슈트래커 연결',
    intro: '프로젝트당 한 번만 붙이면 팀 전체가 이 권한으로 읽습니다.',
    tokenNote: 'id.atlassian.com → 보안 → API 토큰에서 발급합니다.',
    fields: [
      { name: 'host', label: '도메인', placeholder: 'yourteam.atlassian.net', required: true },
      { name: 'email', label: '토큰을 발급한 계정 이메일', type: 'email', placeholder: 'bot@company.com', required: true },
      { name: 'token', label: 'API 토큰', type: 'password', placeholder: 'ATATT3x...', required: true, secret: true },
      {
        name: 'projects', label: '읽을 프로젝트 키 (선택)', placeholder: 'PAY SRCH REL',
        hint: '비우면 이 계정이 볼 수 있는 프로젝트를 전부 읽습니다. 남의 팀 이슈까지 딸려 올 수 있습니다.',
      },
    ],
    connect: connectJira,
    saveIdentities: saveJiraIdentities,
  },
  alerts: {
    vendor: 'Sentry',
    title: '장애 알림 연결',
    intro: '프로젝트당 한 번만 붙이면 됩니다. 미해결 이슈만, 최근 것만 읽습니다.',
    tokenNote: '설정 → Developer Settings → Internal Integration 에서 발급합니다. '
      + '개인 Auth Token 은 그 사람에게 묶여 팀 커넥터로는 맞지 않습니다.',
    fields: [
      { name: 'base_url', label: '주소', placeholder: 'https://sentry.io', hint: '자체 호스팅이면 그 주소를 넣습니다.' },
      { name: 'org', label: '조직 슬러그', placeholder: 'my-company', required: true },
      { name: 'token', label: 'Internal Integration 토큰', type: 'password', placeholder: 'sntrys_...', required: true, secret: true },
      {
        name: 'projects', label: '읽을 프로젝트 슬러그 (선택)', placeholder: 'commerce-api pay-worker',
        hint: '비우면 이 토큰이 볼 수 있는 프로젝트를 전부 읽습니다.',
      },
    ],
    connect: connectSentry,
    saveIdentities: saveSentryIdentities,
  },
};

export function ConnectorConnect({
  projectId, connectorId, current, members, onClose,
}: {
  projectId: string;
  connectorId: Extract<ConnectorId, 'jira' | 'alerts'>;
  current: ConnectorPublic;
  members: string[];
  onClose: () => void;
}) {
  const spec = SPECS[connectorId];
  const [state, action, pending] = useActionState<ConnectorConnectState, FormData>(
    spec.connect.bind(null, projectId), {},
  );

  const people = state.people ?? (current ? Object.keys(current.identityMap) : []);
  const connected = state.ok || !!current;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-[rgba(16,24,35,.45)] p-4 sm:items-center">
      <div
        role="dialog" aria-modal="true" aria-label={spec.title}
        className="card-drop max-h-[90vh] w-full max-w-[560px] overflow-y-auto rounded-sm border border-[var(--rule)] bg-white px-6 py-6 shadow-[0_10px_40px_rgba(20,22,26,.28)] sm:px-8 sm:py-7"
      >
        <span className="stencil">{spec.vendor}</span>
        <h2 className="mt-2 text-[23px] font-bold leading-snug">{spec.title}</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-[var(--ink-soft)]">
          {spec.intro}{' '}
          <strong className="text-[var(--ink)]">개인 계정보다 봇 계정을 권합니다</strong> —
          연결한 분이 팀을 떠나거나 토큰이 만료되면 팀 전체가 끊깁니다.
        </p>

        <form action={action} className="mt-6">
          <span className="stencil !text-[10px]">1 · 접속</span>

          {spec.fields.map((f) => (
            <Field
              key={f.name} {...f}
              label={f.secret && current?.hasToken ? `${f.label} (다시 붙여넣어야 바뀝니다)` : f.label}
              hint={f.name === 'token' ? `${spec.tokenNote} 저장 후에는 다시 볼 수 없습니다.` : f.hint}
              defaultValue={f.secret ? undefined : current?.defaults[f.name]}
            />
          ))}

          {state.error && (
            <p className="mt-4 border-l-2 border-[var(--stamp)] py-1 pl-3 text-[15px] leading-snug text-[var(--stamp)]">
              {state.error}
            </p>
          )}
          {state.ok && (
            <p className="mt-4 border-l-2 border-[var(--live)] py-1 pl-3 text-[15px] leading-snug text-[var(--ink-soft)]">
              읽혔습니다. 프로젝트 {state.projects?.length ?? 0}곳 · 담당자 {people.length}명을 찾았습니다.
            </p>
          )}

          <div className="mt-5 flex flex-wrap justify-end gap-2.5">
            <button type="button" onClick={onClose} className={outlineBtn}>닫기</button>
            <button type="submit" disabled={pending} className={solidBtn}>
              {pending ? '확인 중…' : connected ? '다시 확인하고 저장' : '확인하고 연결'}
            </button>
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-[var(--placeholder)]">
            저장 전에 실제로 읽히는지 확인합니다. 안 읽히면 연결하지 않습니다 —
            연결됐다고 표시해 놓고 근거 없이 판정하는 것이 가장 나쁜 상태이기 때문입니다.
          </p>
        </form>

        {connected && (
          <IdentityStep
            projectId={projectId} people={people} members={members}
            current={current?.identityMap ?? {}} save={spec.saveIdentities}
          />
        )}
      </div>
    </div>
  );
}

function IdentityStep({
  projectId, people, members, current, save,
}: {
  projectId: string; people: string[]; members: string[];
  current: Record<string, string>;
  save: (projectId: string, form: FormData) => Promise<void>;
}) {
  const [saved, setSaved] = useState(false);
  const unmapped = people.filter((p) => !current[p]).length;

  return (
    <form
      action={async (fd) => { await save(projectId, fd); setSaved(true); }}
      className="mt-8 border-t border-dashed border-[var(--rule)] pt-6"
    >
      <span className="stencil !text-[10px]">2 · 사람</span>
      <p className="mt-2 text-[15px] leading-relaxed text-[var(--ink-soft)]">
        저쪽 이름과 이 앱의 이름이 다르면 근거가 사람에게 안 붙습니다.
        <strong className="text-[var(--ink)]"> 안 맞추면 조용히 0건이 되고</strong>,
        화면에는 “확인 불가”로만 보여 원인을 찾을 수 없습니다.
      </p>

      {people.length === 0 ? (
        <p className="mt-3 text-[14.5px] text-[var(--placeholder)]">
          아직 담당자가 잡힌 항목을 찾지 못했습니다. 위에서 한 번 더 확인해주세요.
        </p>
      ) : (
        <>
          {unmapped > 0 && (
            <p className="mt-3 border-l-2 border-[var(--verdict-shrink)] py-1 pl-3 text-[14.5px] leading-snug text-[var(--ink-soft)]">
              {unmapped}명이 아직 안 맞춰졌습니다. 이 사람들이 담당한 항목은 참석자로 붙지 않습니다.
            </p>
          )}
          <ul className="mt-4 space-y-2.5">
            {people.map((p) => (
              <li key={p} className="flex flex-wrap items-center gap-3">
                <span className="min-w-0 flex-1 truncate text-[15.5px]">{p}</span>
                <span className="text-[var(--placeholder)]">→</span>
                <select
                  name={`id:${p}`} defaultValue={current[p] ?? matchGuess(p, members) ?? ''}
                  className="h-10 min-w-[9.5rem] rounded-sm border border-[var(--input-border)] px-2.5 text-[15px] outline-none focus:border-[var(--ink)]"
                >
                  <option value="">— 맞추지 않음</option>
                  {members.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </li>
            ))}
          </ul>
          <div className="mt-5 flex items-center justify-end gap-3">
            {saved && <span className="text-[14px] text-[var(--live)]">저장했습니다</span>}
            <button type="submit" className={solidBtn}>사람 매핑 저장</button>
          </div>
        </>
      )}
    </form>
  );
}

/** 글자가 그대로 같을 때만 미리 골라 둔다. 비슷하다고 짐작해서 엉뚱한 사람에게 붙이지 않는다. */
function matchGuess(theirs: string, members: string[]): string | undefined {
  const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();
  return members.find((m) => norm(m) === norm(theirs));
}

function Field({
  label, name, placeholder, defaultValue, hint, type = 'text', required = false,
}: FieldSpec & { defaultValue?: string }) {
  return (
    <label className="mt-4 block">
      <span className="text-[13.5px] font-semibold text-[var(--ink-soft)]">{label}</span>
      <input
        name={name} type={type} placeholder={placeholder} defaultValue={defaultValue}
        required={required} autoComplete="off"
        className="mt-1 h-11 w-full rounded-sm border border-[var(--input-border)] px-3.5 text-[15.5px] outline-none focus:border-[var(--ink)]"
      />
      {hint && <span className="mt-1 block text-[13px] leading-snug text-[var(--placeholder)]">{hint}</span>}
    </label>
  );
}
