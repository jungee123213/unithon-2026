import { createClient } from '@supabase/supabase-js';

/**
 * 서버 전용 클라이언트. service_role 키를 쓴다 — 절대 클라이언트 번들에 들어가면 안 된다.
 * 설계 문서 §9.3: 키는 Vercel 환경변수에만. 훅은 API Route 만 호출하므로 레포가 public 이어도 된다.
 */
export function serverClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 설정되지 않았습니다');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

/** 브라우저용 (T3). anon 키 + RLS select-only. Realtime 구독에 쓴다 (FR-5.4). */
export function browserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 가 설정되지 않았습니다');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}
