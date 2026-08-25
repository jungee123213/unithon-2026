'use client';

import Link from 'next/link';
import { useState } from 'react';
import { PageHero } from './page-hero';
import { DashRule, Stencil } from './receipt-parts';
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
      <pre className={`mt-2 overflow-x-auto whitespace-pre-wrap break-all rounded-sm border border-[var(--rule)] bg-[var(--card-tint)] px-4 py-3.5 text-[15px] leading-relaxed ${mono ? 'font-[family-name:var(--font-receipt-mono)]' : ''}`}>
{value}
      </pre>
    </div>
  );
}

const pillWhite =
  'inline-flex h-10 items-center justify-center rounded-sm border border-white bg-white px-[18px] text-[15px] font-bold text-[var(--navy)] transition-colors hover:bg-[var(--navy-ink-soft)]';
const pillOutline =
  'inline-flex h-10 items-center justify-center rounded-sm border border-[var(--navy-border-3)] bg-transparent px-[18px] text-[15px] font-semibold text-white transition-colors hover:bg-[var(--navy-soft)]';

export function ProjectDetailView({ p }: { p: ProjectDetail }) {
  const [revealed, setRevealed] = useState(false);
  const install =
    `TEAMSYNC_TOKEN=${p.myToken} \\\n  ./hooks/install.sh <프로젝트경로> ${p.myName} ${p.id} ${p.appUrl}`;

  return (
    <div>
      <PageHero
        crumbs={[{ label: 'TeamSync', href: '/' }, { label: '프로젝트', href: '/projects' }, { label: p.name }]}
        backHref="/projects"
        backLabel="← 프로젝트 목록"
        title={p.name}
        actions={
          <>
            <span className="tabular text-[16px] text-[var(--navy-ink-faint)]">{p.id}</span>
            <Link href={`/p/${p.id}/no-meeting`} className={pillWhite}>회의 판정 열기 →</Link>
            <Link href={`/p/${p.id}/no-meeting/ledger`} className={pillOutline}>결정 원장 →</Link>
          </>
        }
        maxWidth={1000}
      />

      <div className="mx-auto w-full max-w-[1000px] px-5 py-10 sm:px-10">
        <section>
          <h2 className="border-b-2 border-[var(--ink)] pb-4 text-[22px] font-bold tracking-tight sm:text-[24px]">팀원 초대</h2>
          <div className="border-b border-[var(--rule-soft)] py-7">
            <p className="text-[16px] leading-relaxed text-[var(--ink-soft)] sm:text-[17px]">
              이 코드를 팀원에게 알려주면 참여할 수 있습니다.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-6">
              <span className="tabular rounded-sm border-2 border-[var(--ink)] px-5 py-2.5 text-[24px] font-bold tracking-[0.28em] sm:text-[28px]">
                {p.joinCode}
              </span>
              <span className="text-[15px] text-[var(--ink-faint)]">
                참여한 사람마다 <strong className="text-[var(--ink)]">각자의 토큰</strong>이 따로 발급됩니다.
              </span>
            </div>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="border-b-2 border-[var(--ink)] pb-4 text-[22px] font-bold tracking-tight sm:text-[24px]">내 훅 설치 명령</h2>
          <div className="border-b border-[var(--rule-soft)] py-7">
            <p className="text-[16px] leading-relaxed text-[var(--ink-soft)] sm:text-[17px]">
              연동하려는 <strong className="text-[var(--ink)]">폴더</strong>에서 이 명령을 실행하면 됩니다.
              그 폴더에서 <code className="tabular">claude</code> 를 띄웠을 때만 동작합니다 —
              다른 폴더의 작업은 전송되지 않습니다.
            </p>

            {revealed ? (
              <div className="mt-5">
                <Copyable label="설치 명령 (내 토큰 포함)" value={install} />
              </div>
            ) : (
              <button onClick={() => setRevealed(true)}
                className="mt-5 w-full rounded-sm border-2 border-dashed border-[var(--rule)] px-4 py-6 text-[16px] font-bold text-[var(--ink-soft)] transition-colors hover:border-[var(--ink)] hover:text-[var(--ink)]">
                토큰 보기 (화면 공유 중이라면 주의)
              </button>
            )}

            <DashRule className="my-5" />
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <span className="text-[15px] text-[var(--ink-faint)]">
                토큰이 새어 나갔다면 재발급하세요. 재발급하면 훅을 다시 설치해야 합니다.
              </span>
              <button onClick={() => { void rotateToken(p.id); }}
                className="rounded-sm border border-[var(--stamp)] px-4 py-2 text-[15px] font-bold text-[var(--stamp)] transition-colors hover:bg-[var(--stamp)] hover:text-white">
                토큰 재발급
              </button>
            </div>
          </div>
        </section>

        <section className="mt-10">
          <div className="flex items-baseline justify-between gap-4 border-b-2 border-[var(--ink)] pb-4">
            <h2 className="text-[22px] font-bold tracking-tight sm:text-[24px]">멤버</h2>
            <span className="text-[15px] font-medium text-[var(--ink-faint)]">{p.members.length}명</span>
          </div>
          {p.members.map((m) => (
            <div key={m.display_name + m.joined_at} className="flex items-baseline justify-between gap-4 border-b border-[var(--rule-soft)] py-5">
              <span className="text-[18px] font-bold">{m.display_name}</span>
              <span className="rounded-sm border border-[var(--ink-faint)] px-2.5 py-0.5 text-[13px] font-bold text-[var(--ink-soft)]">
                {m.role === 'owner' ? '오너' : '멤버'}
              </span>
            </div>
          ))}
        </section>

        <Link href="/projects"
          className="mt-10 flex h-12 w-fit items-center gap-2 rounded-sm border border-[var(--rule)] bg-white px-6 text-[16px] font-semibold text-[var(--ink)] transition-colors hover:border-[var(--ink)]">
          ← 프로젝트 목록
        </Link>
      </div>
    </div>
  );
}
