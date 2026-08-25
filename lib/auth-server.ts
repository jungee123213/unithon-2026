import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { serverClient } from './supabase';

/**
 * 로그인 사용자용 서버 클라이언트 (쿠키 기반 세션).
 * anon 키 + RLS 로 동작한다 — 이 클라이언트로는 자기가 속한 프로젝트만 보인다.
 */
export async function authClient() {
  const store = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list) => {
          try {
            list.forEach(({ name, value, options }) => store.set(name, value, options));
          } catch {
            // 서버 컴포넌트에서는 쓸 수 없다. middleware 가 갱신을 담당한다.
          }
        },
      },
    },
  );
}

export async function currentUser() {
  const db = await authClient();
  const { data } = await db.auth.getUser();
  return data.user ?? null;
}

export type Membership = {
  project_id: string;
  display_name: string;
  role: string;
  project_name: string;
};

/** 이 사용자가 속한 프로젝트 목록 */
export async function myProjects(userId: string): Promise<Membership[]> {
  // service_role 로 조회한다 — RLS 정책이 project_members 를 자기참조하므로
  // 재귀를 피하려면 서버가 직접 읽는 편이 단순하다.
  const db = serverClient();
  const { data } = await db
    .from('project_members')
    .select('project_id, display_name, role, projects(name)')
    .eq('user_id', userId)
    .order('joined_at', { ascending: true });

  return (data ?? []).map((m) => {
    const proj = m.projects as unknown as { name?: string } | null;
    return {
      project_id: m.project_id,
      display_name: m.display_name,
      role: m.role,
      project_name: proj?.name ?? m.project_id,
    };
  });
}

/** 이 사용자가 그 프로젝트의 멤버인가 */
export async function membershipOf(userId: string, projectId: string) {
  const db = serverClient();
  const { data } = await db
    .from('project_members')
    .select('project_id, user_id, display_name, hook_token, role')
    .eq('user_id', userId).eq('project_id', projectId)
    .maybeSingle();
  return data;
}
