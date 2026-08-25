'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { DashRule, Roll, Stencil } from './receipt-parts';
import { signIn, signUp, type AuthState } from '@/app/auth-actions';

const field =
  'mt-1 w-full rounded-sm border-2 border-[var(--rule)] bg-[var(--paper-lit)] px-3 py-2.5 ' +
  'text-[17px] outline-none transition-colors focus:border-[var(--ink)]';

export function AuthForm({ mode }: { mode: 'login' | 'signup' }) {
  const isSignup = mode === 'signup';
  const [state, action, pending] = useActionState<AuthState, FormData>(
    isSignup ? signUp : signIn,
    {},
  );

  return (
    <div className="mx-auto w-full max-w-[440px] px-5 py-16">
      <h1 className="font-[family-name:var(--font-receipt-mono)] text-[30px] font-bold uppercase leading-none tracking-[0.14em]">
        TeamSync
      </h1>
      <p className="mt-2 text-[17px] text-[var(--ink-soft)]">
        {isSignup ? '계정을 만들고 프로젝트에 참여합니다.' : '보고하지 않는다. 읽지 않는다. 결정만 한다.'}
      </p>

      <div className="mt-7">
        <Roll>
          <Stencil>{isSignup ? '회원가입' : '로그인'}</Stencil>
          <DashRule className="my-4" />

          <form action={action} className="space-y-4">
            {isSignup && (
              <label className="block">
                <span className="text-[15px] font-semibold">이름</span>
                <input name="display_name" required autoComplete="name" className={field}
                  placeholder="지우" />
                <span className="mt-1 block text-[14px] text-[var(--ink-faint)]">
                  동료의 에이전트가 이 이름으로 당신을 부릅니다.
                </span>
              </label>
            )}

            <label className="block">
              <span className="text-[15px] font-semibold">이메일</span>
              <input name="email" type="email" required autoComplete="email" className={field} />
            </label>

            <label className="block">
              <span className="text-[15px] font-semibold">비밀번호</span>
              <input name="password" type="password" required minLength={6}
                autoComplete={isSignup ? 'new-password' : 'current-password'} className={field} />
            </label>

            {state.error && (
              <p className="rounded-sm border-l-[3px] border-[var(--stamp)] bg-[color-mix(in_srgb,var(--stamp)_8%,transparent)] px-3 py-2 text-[15px]"
                 style={{ color: 'var(--stamp)' }}>
                {state.error}
              </p>
            )}

            <button type="submit" disabled={pending}
              className="w-full rounded-sm border-2 border-[var(--ink)] bg-[var(--ink)] px-4 py-3 text-[17px] font-semibold text-[var(--paper-lit)] transition-all enabled:hover:-translate-y-0.5 enabled:hover:shadow-[0_5px_0_-2px_var(--ink)] disabled:opacity-50">
              {pending ? '처리 중…' : isSignup ? '가입하고 시작' : '로그인'}
            </button>
          </form>

          <DashRule className="my-4" />
          <p className="text-center text-[15px] text-[var(--ink-soft)]">
            {isSignup ? '이미 계정이 있나요? ' : '계정이 없나요? '}
            <Link href={isSignup ? '/login' : '/signup'}
              className="font-semibold text-[var(--ink)] underline underline-offset-4">
              {isSignup ? '로그인' : '회원가입'}
            </Link>
          </p>
        </Roll>
      </div>
    </div>
  );
}
