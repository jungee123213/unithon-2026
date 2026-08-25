import { serverClient } from './supabase';

/**
 * 훅 토큰 → (project_id, member) 해석.
 *
 * 이 함수가 범위 분리의 마지막 관문이다. 훅이 보내는 project_id·member 는
 * 이제 신뢰하지 않는다 — 토큰이 결정한다. 남의 프로젝트에 밀어넣을 수 없다.
 *
 * 이전 방식(팀 공유 시크릿 1개)도 당분간 받는다. 이미 설치된 훅이 조용히
 * 죽으면 원인을 찾기 어렵기 때문이다. legacy 로 표시해 두고 디버그 창에서 보이게 한다.
 */
export type HookIdentity =
  | { ok: true; projectId: string; member: string; legacy: false }
  | { ok: true; projectId: null; member: null; legacy: true }
  | { ok: false };

export async function identify(req: Request): Promise<HookIdentity> {
  const token = req.headers.get('x-teamsync-token') ?? '';
  if (!token) return { ok: false };

  if (token.startsWith('tsk_')) {
    const db = serverClient();
    const { data } = await db
      .from('project_members')
      .select('project_id, display_name')
      .eq('hook_token', token)
      .maybeSingle();
    if (!data) return { ok: false };
    return { ok: true, projectId: data.project_id, member: data.display_name, legacy: false };
  }

  // 구버전: 공유 시크릿. 프로젝트를 특정하지 못하므로 본문 값을 그대로 쓴다.
  const shared = process.env.TEAMSYNC_TOKEN;
  if (shared && token === shared) return { ok: true, projectId: null, member: null, legacy: true };

  return { ok: false };
}

/** 디버그 창의 소스. 실패한 것이 성공한 것보다 중요하다. */
export async function logIngest(row: {
  project_id?: string | null;
  member?: string | null;
  session_id?: string | null;
  branch?: string | null;
  turn_count?: number;
  total_chars?: number;
  outcome: 'created' | 'skipped' | 'rejected' | 'error';
  reason?: string | null;
  context_id?: number | null;
  decisions?: number;
  duration_ms?: number;
}) {
  try {
    await serverClient().from('ingest_log').insert(row);
  } catch {
    // 로깅 실패가 수집을 막으면 안 된다
  }
}
