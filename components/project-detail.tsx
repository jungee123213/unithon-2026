'use client';

import Link from 'next/link';
import { useState } from 'react';
import { DashRule, Roll, Stencil } from './receipt-parts';
import { rotateToken } from '@/app/projects/actions';

export type ProjectDetail = {
  id: string;
  name: string;
  joinCode: string;
  myName: string;
  myToken: string;
  role: string;
  members: { display_name: string; role: string; joined_at: string }[];
  appUrl: string;
};

function Copyable({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <Stencil>{label}</Stencil>
        <button
          onClick={() => {
            navigator.clipboard?.writeText(value).then(
              () => { setCopied(true); setTimeout(() => setCopied(false), 1600); },
              () => {},
            );
          }}
          className="stencil border-b border-dotted border-[var(--rule)] pb-0.5 hover:text-[var(--ink)]"
          style={copied ? { color: 'var(--live)' } : undefined}
        >
          {copied ? '복사됨' : '복사'}
        </button>
      </div>
      <pre className={`mt-1.5 overflow-x-auto whitespace-pre-wrap break-all rounded-sm border border-[var(--rule)] bg-[color-mix(in_srgb,var(--paper)_50%,transparent)] px-3 py-2.5 text-[15px] leading-relaxed ${mono ? 'font-[family-name:var(--font-receipt-mono)]' : ''}`}>
{value}
      </pre>
    </div>
  );
}

export function ProjectDetailView({ p }: { p: ProjectDetail }) {
  const [revealed, setRevealed] = useState(false);
  const install =
    `TEAMSYNC_TOKEN=${p.myToken} \\\n  ./hooks/install.sh <프로젝트경로> ${p.myName} ${p.id} ${p.appUrl}`;

  return (
    <div className="mx-auto w-full max-w-[860px] px-5 py-10 sm:px-8">
      <header className="pb-7">
        <Link href="/projects" className="stencil hover:text-[var(--ink)]">← 프로젝트 목록</Link>
        <h1 className="mt-1 text-[32px] font-bold leading-tight">{p.name}</h1>
        <p className="mt-1 flex flex-wrap items-baseline gap-3">
          <span className="tabular text-[16px] text-[var(--ink-faint)]">{p.id}</span>
          <Link href={`/p/${p.id}`} className="text-[16px] font-semibold underline underline-offset-4 hover:text-[var(--stamp)]">
            Team Space 열기 →
          </Link>
          <Link href={`/p/${p.id}/debug`} className="text-[16px] font-semibold underline underline-offset-4 hover:text-[var(--stamp)]">
            디버그 →
          </Link>
        </p>
      </header>

      <div className="space-y-7">
        <Roll>
          <Stencil>팀원 초대</Stencil>
          <p className="mt-1 text-[16px] text-[var(--ink-soft)]">
            이 코드를 팀원에게 알려주면 참여할 수 있습니다.
          </p>
          <div className="mt-3 flex items-center gap-4">
            <span className="tabular rounded-sm border-2 border-[var(--ink)] px-4 py-2 text-[26px] font-bold tracking-[0.28em]">
              {p.joinCode}
            </span>
            <span className="text-[15px] text-[var(--ink-faint)]">
              참여한 사람마다 <strong className="text-[var(--ink)]">각자의 토큰</strong>이 따로 발급됩니다.
            </span>
          </div>
        </Roll>

        <Roll>
          <Stencil>내 훅 설치 명령</Stencil>
          <p className="mt-1 text-[16px] leading-relaxed text-[var(--ink-soft)]">
            연동하려는 <strong className="text-[var(--ink)]">폴더</strong>에서 이 명령을 실행하면 됩니다.
            그 폴더에서 <code className="tabular">claude</code> 를 띄웠을 때만 동작합니다 —
            다른 폴더의 작업은 전송되지 않습니다.
          </p>
          <DashRule className="my-4" />

          {revealed ? (
            <Copyable label="설치 명령 (내 토큰 포함)" value={install} />
          ) : (
            <button onClick={() => setRevealed(true)}
              className="w-full rounded-sm border-2 border-dashed border-[var(--rule)] px-4 py-6 text-[16px] font-semibold text-[var(--ink-soft)] transition-colors hover:border-[var(--ink)] hover:text-[var(--ink)]">
              토큰 보기 (화면 공유 중이라면 주의)
            </button>
          )}

          <DashRule className="my-4" />
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <span className="text-[15px] text-[var(--ink-faint)]">
              토큰이 새어 나갔다면 재발급하세요. 재발급하면 훅을 다시 설치해야 합니다.
            </span>
            <button onClick={() => { void rotateToken(p.id); }}
              className="stencil border-b border-dotted border-[var(--rule)] pb-0.5 hover:text-[var(--stamp)]">
              토큰 재발급
            </button>
          </div>
        </Roll>

        <Roll>
          <Stencil>멤버 {p.members.length}명</Stencil>
          <ul className="mt-2 divide-y divide-dotted divide-[var(--rule)]">
            {p.members.map((m) => (
              <li key={m.display_name + m.joined_at} className="flex items-baseline justify-between gap-3 py-2.5">
                <span className="text-[17px] font-semibold">{m.display_name}</span>
                <span className="stencil">{m.role === 'owner' ? '오너' : '멤버'}</span>
              </li>
            ))}
          </ul>
        </Roll>
      </div>
    </div>
  );
}
