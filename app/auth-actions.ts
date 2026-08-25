'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { authClient } from '@/lib/auth-server';

export type AuthState = { error?: string };

/** 자체 로그인 — 소셜 없음. 이메일 + 비밀번호. */
export async function signIn(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get('email') ?? '').trim();
  const password = String(form.get('password') ?? '');
  if (!email || !password) return { error: '이메일과 비밀번호를 입력해주세요.' };

  const db = await authClient();
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) return { error: '이메일 또는 비밀번호가 맞지 않습니다.' };

  revalidatePath('/', 'layout');
  redirect('/projects');
}

export async function signUp(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get('email') ?? '').trim();
  const password = String(form.get('password') ?? '');
  const displayName = String(form.get('display_name') ?? '').trim();

  if (!email || !password) return { error: '이메일과 비밀번호를 입력해주세요.' };
  if (password.length < 6) return { error: '비밀번호는 6자 이상이어야 합니다.' };
  if (!displayName) return { error: '이름을 입력해주세요. 동료의 에이전트가 이 이름으로 당신을 부릅니다.' };

  const db = await authClient();
  const { error } = await db.auth.signUp({
    email, password,
    options: { data: { display_name: displayName } },
  });
  if (error) {
    return { error: error.message.includes('already') ? '이미 가입된 이메일입니다.' : error.message };
  }

  revalidatePath('/', 'layout');
  redirect('/projects');
}

export async function signOut() {
  const db = await authClient();
  await db.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/login');
}
