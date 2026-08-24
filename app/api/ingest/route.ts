import { NextResponse } from 'next/server';
import { serverClient } from '@/lib/supabase';
import { summarize } from '@/lib/summarize';
import { authorized } from '@/lib/auth';
import { MIN_TURN_CHARS, type IngestRequest, type IngestResponse } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Db = ReturnType<typeof serverClient>;

/**
 * merged_branches 는 "지금 기준 브랜치에 들어가 있는 브랜치 전부"다.
 * 목록에 없는데 우리가 알고 있는 브랜치는 아직 머지 전이므로 false 로 되돌린다
 * (브랜치가 되살아나는 경우 — revert, 재분기).
 */
async function upsertBranches(
  db: Db, project_id: string, member: string, current: string, merged: string[],
) {
  const seen = new Set([...merged, current].filter(Boolean));
  const rows = [...seen].map((branch) => ({
    project_id, branch,
    merged: merged.includes(branch),
    reported_by: member,
    updated_at: new Date().toISOString(),
  }));
  if (rows.length === 0) return;

  await db.from('branches').upsert(rows, { onConflict: 'project_id,branch' });

  // 이번 보고에서 빠진 브랜치는 머지 전 상태로 되돌린다
  await db.from('branches')
    .update({ merged: false, reported_by: member, updated_at: new Date().toISOString() })
    .eq('project_id', project_id)
    .eq('merged', true)
    .not('branch', 'in', `(${[...seen].map((b) => `"${b}"`).join(',')})`);
}

function valid(b: unknown): b is IngestRequest {
  if (!b || typeof b !== 'object') return false;
  const r = b as Record<string, unknown>;
  return (
    typeof r.project_id === 'string' && r.project_id.length > 0 &&
    typeof r.member === 'string' && r.member.length > 0 &&
    typeof r.session_id === 'string' && r.session_id.length > 0 &&
    Array.isArray(r.turns)
  );
}

const json = (body: IngestResponse, status = 200) => NextResponse.json(body, { status });

/**
 * POST /api/ingest — 계약: docs/CONTRACT.md §1
 *
 * 호출자(flush.sh)는 detach 되어 있어 응답 본문을 읽지 않는다.
 * 상태 코드만이 재시도 여부를 결정한다: 4xx=버림, 5xx=pending 큐.
 */
export async function POST(req: Request) {
  if (!authorized(req)) return json({ ok: false, error: 'unauthorized' }, 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: 'invalid_body' }, 400);
  }
  if (!valid(body)) return json({ ok: false, error: 'invalid_body' }, 400);

  const { project_id, member, session_id, branch, turns, force, merged_branches } = body;
  if (turns.length === 0) return json({ ok: true, skipped: true, reason: 'empty' });

  // EX-6 · 잡음 세션. 훅에서도 거르지만 서버가 마지막 방어선이다.
  const total = turns.reduce((n, t) => n + (t?.text?.length ?? 0), 0);
  if (total < MIN_TURN_CHARS && !force) {
    return json({ ok: true, skipped: true, reason: 'too_short' });
  }

  try {
    const db = serverClient();

    // 진행사항 문서의 상태 근거를 먼저 갱신한다.
    // 요약을 건너뛰는 세션(팀과 무관·너무 짧음)에서도 git 사실은 유효하므로
    // skip 판정보다 앞에 둔다 — 이 값이 낡으면 "머지됨"이 영영 안 뜬다.
    if (Array.isArray(merged_branches)) {
      await upsertBranches(db, project_id, member, branch, merged_branches);
    }

    // 멱등성 — 재시도 안전 (계약 §1). 같은 세션이 두 번 오면 LLM 을 다시 부르지 않는다.
    const { data: existing } = await db
      .from('context').select('id')
      .eq('project_id', project_id).eq('session_id', session_id)
      .maybeSingle();
    if (existing) return json({ ok: true, skipped: true, reason: 'duplicate' });

    // FR-4.1 · 요약과 decisions 를 단일 호출로. §5.1 L3 판정도 여기서 같이 일어난다.
    const result = await summarize(turns, branch ?? '');
    if (result.skip) return json({ ok: true, skipped: true, reason: 'not_team_relevant' });

    const { data: ctx, error: ctxErr } = await db
      .from('context')
      .insert({ project_id, member, summary: result.summary, summary_plain: result.summaryPlain, work_label: result.workLabel, session_id, branch })
      .select('id').single();

    if (ctxErr) {
      // 동시에 두 번 도착한 경우 unique index 가 잡는다
      if (ctxErr.code === '23505') return json({ ok: true, skipped: true, reason: 'duplicate' });
      throw ctxErr;
    }

    let decisionCount = 0;
    if (result.decisions.length > 0) {
      const rows = result.decisions.map((d) => ({
        project_id,
        question: d.question,
        options: d.options,
        source_context_id: ctx.id,
      }));
      const { error } = await db.from('decisions').insert(rows);
      if (!error) decisionCount = rows.length;
    }

    return json({ ok: true, skipped: false, context_id: ctx.id, decisions: decisionCount });
  } catch (err) {
    console.error('[ingest]', err);
    return json({ ok: false, error: 'server_error' }, 500);   // → 훅이 pending 큐에 넣고 재시도
  }
}
