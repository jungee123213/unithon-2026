import { redirect } from 'next/navigation';
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

/**
 * 이 페이지를 볼 자격이 있는가 — **화면 하나마다 여기를 지나야 한다.**
 *
 * 미들웨어는 세션 쿠키 갱신만 하고 인증 판정은 하지 않는다(`middleware.ts`).
 * 그래서 가드를 빠뜨린 페이지는 로그인 없이 그냥 열린다. 실제로 여섯 화면이
 * 그렇게 열려 있었고, 커넥터 설정 화면은 붙여 둔 봇 계정 이메일과 팀원 실명
 * 매핑까지 보여줬다. 페이지마다 두 줄을 복사해 넣는 대신 한 곳으로 모은다 —
 * 새 화면을 만들 때 빠뜨릴 여지를 줄이는 게 목적이다.
 */
export async function requireMember(projectId: string) {
  const user = await currentUser();
  if (!user) redirect('/login');
  const m = await membershipOf(user.id, projectId);
  if (!m) redirect('/projects');
  return m;
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

export type ProjectMember = {
  display_name: string;
  role: string;
};

/**
 * 이 프로젝트에 참여 중인 사람들.
 *
 * 회의 신청서의 참석 후보가 여기서 나온다. 이름을 직접 타이핑하게 두면
 * `already_delivered` 게이트가 대조에 실패한다 — 주입 기록(`injections.member`)이
 * 쓰는 이름이 곧 `display_name` 이기 때문이다. 목록에서 고르게 하면 그 둘이 맞는다.
 */
export async function projectMembers(projectId: string): Promise<ProjectMember[]> {
  const db = serverClient();
  const { data } = await db
    .from('project_members')
    .select('display_name, role')
    .eq('project_id', projectId)
    .order('joined_at', { ascending: true });
  return data ?? [];
}
