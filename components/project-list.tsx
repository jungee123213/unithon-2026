'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { PageHero } from './page-hero';
import { DashRule } from './receipt-parts';
import { createProject, joinProject, type ProjectState } from '@/app/projects/actions';
import type { Membership } from '@/lib/auth-server';

const field =
  'mt-1 w-full rounded-sm border-2 border-[var(--input-border)] bg-white px-3 py-2.5 ' +
  'text-[17px] outline-none transition-colors focus:border-[var(--ink)]';
const button =
  'w-full rounded-sm border-2 border-[var(--ink)] px-4 py-2.5 text-[16px] font-semibold ' +
  'transition-all enabled:hover:-translate-y-0.5 enabled:hover:shadow-[0_5px_0_-2px_var(--ink)] disabled:opacity-50';

export function ProjectList({ projects, name }: { projects: Membership[]; name: string }) {
  const [cState, createAction, creating] = useActionState<ProjectState, FormData>(createProject, {});
  const [jState, joinAction, joining] = useActionState<ProjectState, FormData>(joinProject, {});

  return (
    <div>
      <PageHero
        crumbs={[{ label: 'TeamSync', href: '/' }, { label: '프로젝트' }]}
        title="프로젝트"
        subtitle={<><strong className="text-white">{name}</strong> 님의 프로젝트</>}
        maxWidth={1100}
      />

      <div className="mx-auto w-full max-w-[1100px] px-5 py-10 sm:px-10">
        {projects.length > 0 && (
          <div className="pb-8">
            <div className="flex items-baseline justify-between gap-4 border-b-2 border-[var(--ink)] pb-4">
              <h2 className="text-[22px] font-bold tracking-tight sm:text-[24px]">참여 중</h2>
              <span className="text-[15px] font-medium text-[var(--ink-faint)]">{projects.length}개</span>
            </div>
            {projects.map((p) => (
              <Link
                key={p.project_id}
                href={`/projects/${p.project_id}`}
                className="grid grid-cols-[1fr_auto] items-baseline gap-4 border-b border-[var(--rule-soft)] py-5 transition-colors hover:bg-[var(--card-tint)] sm:gap-6"
              >
                <span className="flex flex-wrap items-baseline gap-3">
                  <span className="text-[19px] font-bold sm:text-[20px]">{p.project_name}</span>
                  <span className="tabular text-[14px] text-[var(--ink-faint)] sm:text-[15px]">{p.project_id}</span>
                </span>
                <span className="flex shrink-0 flex-wrap items-baseline gap-3">
                  <span className="text-[16px] text-[var(--ink-soft)]">{p.display_name}</span>
                  <span className="rounded-sm border border-[var(--ink-faint)] px-2.5 py-0.5 text-[13px] font-bold text-[var(--ink-soft)]">
                    {p.role === 'owner' ? '오너' : '멤버'}
                  </span>
                  <span className="text-[16px] font-semibold text-[var(--accent)]">열기 →</span>
                </span>
              </Link>
            ))}
          </div>
        )}

        <div className="grid gap-8 pt-2 sm:grid-cols-2">
          <div>
            <div className="border-b-2 border-[var(--ink)] pb-4">
              <h2 className="text-[20px] font-bold sm:text-[22px]">프로젝트 만들기</h2>
            </div>
            <div className="mt-6 rounded-sm border border-[var(--rule)] px-6 py-7 shadow-[0_1px_3px_rgba(20,22,26,.06)]">
              <form action={createAction} className="space-y-4">
                <label className="block">
                  <span className="text-[16px] font-semibold">이름</span>
                  <input name="name" required className={field} placeholder="한끼 배달앱" />
                </label>
                <label className="block">
                  <span className="text-[16px] font-semibold">프로젝트 ID</span>
                  <input name="project_id" className={field} placeholder="hankki" />
                  <span className="mt-1 block text-[15px] text-[var(--ink-faint)]">
                    주소에 쓰입니다. 비우면 이름에서 만듭니다.
                  </span>
                </label>
                {cState.error && <p className="text-[15px]" style={{ color: 'var(--stamp)' }}>{cState.error}</p>}
                <button disabled={creating} className={button}>
                  {creating ? '만드는 중…' : '만들기'}
                </button>
              </form>
            </div>
          </div>

          <div>
            <div className="border-b-2 border-[var(--ink)] pb-4">
              <h2 className="text-[20px] font-bold sm:text-[22px]">참여 코드로 들어가기</h2>
            </div>
            <div className="mt-6 rounded-sm border border-[var(--rule)] px-6 py-7 shadow-[0_1px_3px_rgba(20,22,26,.06)]">
              <form action={joinAction} className="space-y-4">
                <label className="block">
                  <span className="text-[16px] font-semibold">참여 코드</span>
                  <input name="join_code" required maxLength={6}
                    className={`${field} tabular uppercase tracking-[0.3em]`} placeholder="A7K2QM" />
                  <span className="mt-1 block text-[15px] text-[var(--ink-faint)]">
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
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
