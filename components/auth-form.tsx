'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { PageHero } from './page-hero';
import { signIn, signUp, type AuthState } from '@/app/auth-actions';

const field =
  'mt-1 w-full rounded-sm border-2 border-[var(--input-border)] bg-white px-3 py-2.5 ' +
  'text-[17px] outline-none transition-colors focus:border-[var(--ink)]';

export function AuthForm({ mode }: { mode: 'login' | 'signup' }) {
  const isSignup = mode === 'signup';
  const [state, action, pending] = useActionState<AuthState, FormData>(
    isSignup ? signUp : signIn,
    {},
  );

  return (
    <div>
      <PageHero
        crumbs={[{ label: 'no meeting', href: '/' }, { label: isSignup ? '회원가입' : '로그인' }]}
        backHref="/"
        backLabel="← 소개 페이지로"
        title={isSignup ? '회원가입' : '로그인'}
        subtitle={isSignup ? '계정을 만들고 프로젝트에 참여합니다.' : '보고하지 않는다. 읽지 않는다. 결정만 한다.'}
        maxWidth={1280}
      />

      <div className="mx-auto w-full max-w-[520px] px-5 py-14 sm:py-16">
        <div className="rounded-sm border border-[var(--rule)] border-t-[3px] border-t-[var(--ink)] px-7 py-8 shadow-[0_1px_3px_rgba(20,22,26,.06)]">
          <div className="stencil">{isSignup ? '회원가입' : '로그인'}</div>

          <form action={action} className="mt-6 space-y-5">
            {isSignup && (
              <label className="block">
                <span className="text-[16px] font-semibold">이름</span>
                <input name="display_name" required autoComplete="name" className={field}
                  placeholder="지우" />
                <span className="mt-1 block text-[15px] leading-relaxed text-[var(--ink-faint)]">
                  동료의 에이전트가 이 이름으로 당신을 부릅니다.
                </span>
              </label>
            )}

            <label className="block">
              <span className="text-[16px] font-semibold">이메일</span>
              <input name="email" type="email" required autoComplete="email" className={field}
                placeholder="you@team.dev" />
            </label>

            <label className="block">
              <span className="text-[16px] font-semibold">비밀번호</span>
              <input name="password" type="password" required minLength={6}
                autoComplete={isSignup ? 'new-password' : 'current-password'} className={field} />
              {isSignup && (
                <span className="mt-1 block text-[15px] leading-relaxed text-[var(--ink-faint)]">
                  6자 이상 입력해주세요.
                </span>
              )}
            </label>

            {state.error && (
              <p className="border-l-[3px] border-[var(--stamp)] bg-[color-mix(in_srgb,var(--stamp)_8%,transparent)] px-3.5 py-3 text-[16px] leading-snug"
                 style={{ color: 'var(--stamp)' }}>
                {state.error}
              </p>
            )}

            <button type="submit" disabled={pending}
              className="h-[54px] w-full rounded-sm border-0 bg-[var(--ink)] text-[17px] font-bold text-white transition-colors enabled:hover:bg-[var(--accent)] disabled:opacity-50">
              {pending ? '처리 중…' : isSignup ? '가입하고 시작' : '로그인'}
            </button>
          </form>

          <div className="mt-6 border-t border-dashed border-[var(--rule)] pt-5 text-center text-[16px] text-[var(--ink-soft)]">
            {isSignup ? '이미 계정이 있나요? ' : '계정이 없나요? '}
            <Link href={isSignup ? '/login' : '/signup'}
              className="font-bold text-[var(--accent)] underline underline-offset-4">
              {isSignup ? '로그인' : '회원가입'}
            </Link>
          </div>
        </div>

        <Link href="/"
          className="mt-6 flex h-12 w-full items-center justify-center rounded-sm border border-[var(--rule)] bg-white text-[16px] font-semibold text-[var(--ink)] transition-colors hover:border-[var(--ink)]">
          ← 소개 페이지
        </Link>
      </div>
    </div>
  );
}
