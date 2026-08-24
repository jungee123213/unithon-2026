import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { serverClient } from '@/lib/supabase';
import { authorized } from '@/lib/auth';
import { renderInjection } from '@/lib/injection';
import { INJECT_MAX_ITEMS, type ContextItem, type ContextResponse } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const json = (body: ContextResponse, status = 200) => NextResponse.json(body, { status });

/**
 * GET /api/context — 계약: docs/CONTRACT.md §2 · 규칙: 설계 문서 §5.2
 *
 * pull.sh 가 동기로 호출하고 curl --max-time 4 로 자른다. 여기서 LLM 을 부르지 않는 이유다.
 * 주입 규칙 전체가 서버에 있다 — 훅은 문자열을 받아 그대로 넘기기만 한다.
 */
export async function GET(req: Request) {
  if (!authorized(req)) return json({ ok: false, error: 'unauthorized' }, 401);

  const url = new URL(req.url);
  const project_id = url.searchParams.get('project_id');
  const member = url.searchParams.get('member');
  if (!project_id || !member) return json({ ok: false, error: 'invalid_body' }, 400);

  try {
    const db = serverClient();

    // 워터마크 (FR-3.3) — 이미 주입한 것을 다시 주입하지 않는다
    const { data: wmRow } = await db
      .from('injections').select('context_id')
      .eq('project_id', project_id).eq('member', member)
      .order('context_id', { ascending: false })
      .limit(1).maybeSingle();
    const watermark = wmRow?.context_id ?? 0;

    // FR-3.2 자기가 쓴 것 제외 · FR-3.4 최대 5건
    const { data: rows, error } = await db
      .from('context')
      .select('id, member, summary, created_at')
      .eq('project_id', project_id)
      .gt('id', watermark)
      .neq('member', member)
      .order('id', { ascending: true })
      .limit(INJECT_MAX_ITEMS);
    if (error) throw error;

    const items: ContextItem[] = (rows ?? []).map((r) => ({
      context_id: r.id, member: r.member, summary: r.summary, created_at: r.created_at,
    }));

    // §5.3 템플릿 + §5.2 2000자 절단. used 만 소비 처리한다 — 절단된 건 다음 세션에 다시 온다.
    const { injection, used } = renderInjection(items, project_id);
    if (used.length === 0) return json({ ok: true, count: 0, injection: '', items: [] });

    // 소비 기록 (FR-3.3). 훅이 주입에 실패해도 워터마크는 전진한다 — 계약 §2 의 명시된 트레이드오프.
    // rendered 를 그대로 저장한다 — 영수증 뷰(FR-5.1)가 "주입된 문자열 자체"를 보여주려면
    // 프론트에서 재렌더하면 안 된다. 상대시간이 어긋나 화면과 실제가 달라진다.
    const batch_id = randomUUID();
    await db.from('injections').upsert(
      used.map((i) => ({ project_id, member, context_id: i.context_id, batch_id, rendered: injection })),
      { onConflict: 'project_id,member,context_id', ignoreDuplicates: true },
    );

    return json({ ok: true, count: used.length, injection, items: used });
  } catch (err) {
    console.error('[context]', err);
    return json({ ok: false, error: 'server_error' }, 500);
  }
}
