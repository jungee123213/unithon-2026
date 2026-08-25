'use client';

import { createBrowserClient } from '@supabase/ssr';

/** 브라우저용 인증 클라이언트. 로그인·로그아웃과 Realtime 구독에 쓴다. */
export function authBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
