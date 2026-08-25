'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { DashRule, Line, Roll, Stencil } from './receipt-parts';
import { createProject, joinProject, type ProjectState } from '@/app/projects/actions';
import type { Membership } from '@/lib/auth-server';

const field =
  'mt-1 w-full rounded-sm border-2 border-[var(--rule)] bg-[var(--paper-lit)] px-3 py-2.5 ' +
  'text-[17px] outline-none transition-colors focus:border-[var(--ink)]';
const button =
  'w-full rounded-sm border-2 border-[var(--ink)] px-4 py-2.5 text-[16px] font-semibold ' +
  'transition-all enabled:hover:-translate-y-0.5 enabled:hover:shadow-[0_5px_0_-2px_var(--ink)] disabled:opacity-50';

export function ProjectList({ projects, name }: { projects: Membership[]; name: string }) {
  const [cState, createAction, creating] = useActionState<ProjectState, FormData>(createProject, {});
  const [jState, joinAction, joining] = useActionState<ProjectState, FormData>(joinProject, {});

  return (
    <div className="mx-auto w-full max-w-[860px] px-5 py-10 sm:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4 pb-7">
        <div>
          <h1 className="font-[family-name:var(--font-receipt-mono)] text-[30px] font-bold uppercase leading-none tracking-[0.14em]">
            TeamSync
          </h1>
          <p className="mt-2 text-[17px] text-[var(--ink-soft)]">
            <span className="font-semibold text-[var(--ink)]">{name}</span> 님의 프로젝트
          </p>
        </div>
        <form action="/api/signout" method="post">
          <button className="stencil border-b border-dotted border-[var(--rule)] pb-0.5 hover:text-[var(--ink)]">
            로그아웃
          </button>
        </form>
      </header>

      {projects.length > 0 && (
        <div className="pb-8">
          <Stencil className="pb-3">참여 중</Stencil>
          <Roll>
            {projects.map((p) => (
              <Link key={p.project_id} href={`/projects/${p.project_id}`} className="block group">
                <Line
                  label={
                    <span className="group-hover:text-[var(--stamp)]">
                      {p.project_name}
                      <span className="tabular ml-2 text-[14px] text-[var(--ink-faint)]">{p.project_id}</span>
                    </span>
                  }
                  value={
                    <span className="stencil">
                      {p.display_name}{p.role === 'owner' ? ' · 오너' : ''}
                    </span>
                  }
                />
              </Link>
            ))}
          </Roll>
        </div>
      )}

      <div className="grid gap-7 sm:grid-cols-2">
        <div>
          <Stencil className="pb-3">프로젝트 만들기</Stencil>
          <Roll>
            <form action={createAction} className="space-y-3.5">
              <label className="block">
                <span className="text-[15px] font-semibold">이름</span>
                <input name="name" required className={field} placeholder="한끼 배달앱" />
              </label>
              <label className="block">
                <span className="text-[15px] font-semibold">프로젝트 ID</span>
                <input name="project_id" className={field} placeholder="hankki" />
                <span className="mt-1 block text-[14px] text-[var(--ink-faint)]">
                  주소에 쓰입니다. 비우면 이름에서 만듭니다.
                </span>
              </label>
              {cState.error && <p className="text-[15px]" style={{ color: 'var(--stamp)' }}>{cState.error}</p>}
              <button disabled={creating} className={button}>
                {creating ? '만드는 중…' : '만들기'}
              </button>
            </form>
          </Roll>
        </div>

        <div>
          <Stencil className="pb-3">참여 코드로 들어가기</Stencil>
          <Roll>
            <form action={joinAction} className="space-y-3.5">
              <label className="block">
                <span className="text-[15px] font-semibold">참여 코드</span>
                <input name="join_code" required maxLength={6}
                  className={`${field} tabular uppercase tracking-[0.3em]`} placeholder="A7K2QM" />
                <span className="mt-1 block text-[14px] text-[var(--ink-faint)]">
                  팀원에게 받은 6자리 코드
                </span>
              </label>
              {jState.error && <p className="text-[15px]" style={{ color: 'var(--stamp)' }}>{jState.error}</p>}
              <button disabled={joining} className={button}>
                {joining ? '참여 중…' : '참여하기'}
              </button>
            </form>
            <DashRule className="my-4" />
            <p className="text-[15px] leading-relaxed text-[var(--ink-soft)]">
              참여하면 <span className="font-semibold text-[var(--ink)]">당신 전용 훅 토큰</span>이 발급됩니다.
              그 토큰이 어느 프로젝트의 누구인지를 결정하므로, 다른 프로젝트로 새어 나갈 수 없습니다.
            </p>
          </Roll>
        </div>
      </div>
    </div>
  );
}
