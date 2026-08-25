import { NextResponse } from 'next/server';
import { serverClient } from '@/lib/supabase';
import { summarize } from '@/lib/summarize';
import { identify, logIngest } from '@/lib/hook-auth';
import { MIN_TURN_CHARS, type IngestRequest, type IngestResponse } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function valid(b: unknown): b is IngestRequest {
  if (!b || typeof b !== 'object') return false;
  const r = b as Record<string, unknown>;
  return typeof r.session_id === 'string' && r.session_id.length > 0 && Array.isArray(r.turns);
}

const json = (body: IngestResponse, status = 200) => NextResponse.json(body, { status });

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

  await db.from('branches')
    .update({ merged: false, reported_by: member, updated_at: new Date().toISOString() })
    .eq('project_id', project_id)
    .eq('merged', true)
    .not('branch', 'in', `(${[...seen].map((b) => `"${b}"`).join(',')})`);
}

/**
 * POST /api/ingest — 계약: docs/CONTRACT.md §1
 *
 * 호출자(flush.sh)는 detach 되어 있어 응답 본문을 읽지 않는다.
 * 상태 코드만이 재시도 여부를 결정한다: 4xx=버림, 5xx=pending 큐.
 *
 * 신원은 x-teamsync-token 이 결정한다. 본문의 project_id·member 는 신뢰하지 않는다
 * (구버전 공유 시크릿일 때만 폴백으로 쓴다).
 */
export async function POST(req: Request) {
  const started = Date.now();

  const who = await identify(req);
  if (!who.ok) {
    await logIngest({ outcome: 'rejected', reason: 'unauthorized' });
    return json({ ok: false, error: 'unauthorized' }, 401);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: 'invalid_body' }, 400);
  }
  if (!valid(body)) return json({ ok: false, error: 'invalid_body' }, 400);

  const { session_id, branch, turns, force, merged_branches } = body;

  // 토큰이 신원을 결정한다. 구버전 토큰일 때만 본문 값을 쓴다.
  const project_id = who.legacy ? body.project_id : who.projectId;
  const member = who.legacy ? body.member : who.member;
  if (!project_id || !member) return json({ ok: false, error: 'invalid_body' }, 400);

  const total = turns.reduce((n, t) => n + (t?.text?.length ?? 0), 0);
  const base = {
    project_id, member, session_id, branch,
    turn_count: turns.length, total_chars: total,
  };

  if (turns.length === 0) {
    await logIngest({ ...base, outcome: 'skipped', reason: 'empty', duration_ms: Date.now() - started });
    return json({ ok: true, skipped: true, reason: 'empty' });
  }

  // EX-6 · 잡음 세션. 훅에서도 거르지만 서버가 마지막 방어선이다.
  if (total < MIN_TURN_CHARS && !force) {
    await logIngest({ ...base, outcome: 'skipped', reason: 'too_short', duration_ms: Date.now() - started });
    return json({ ok: true, skipped: true, reason: 'too_short' });
  }

  try {
    const db = serverClient();

    // 진행사항 문서의 상태 근거를 먼저 갱신한다.
    // 요약을 건너뛰는 세션에서도 git 사실은 유효하므로 skip 판정보다 앞에 둔다.
    if (Array.isArray(merged_branches)) {
      await upsertBranches(db, project_id, member, branch ?? '', merged_branches);
    }

    const { data: existing } = await db
      .from('context').select('id')
      .eq('project_id', project_id).eq('session_id', session_id)
      .maybeSingle();
    if (existing) {
      await logIngest({ ...base, outcome: 'skipped', reason: 'duplicate', context_id: existing.id, duration_ms: Date.now() - started });
      return json({ ok: true, skipped: true, reason: 'duplicate' });
    }

    // FR-4.1 · 요약과 decisions 를 단일 호출로. §5.1 L3 판정도 여기서 같이 일어난다.
    const result = await summarize(turns, branch ?? '');
    if (result.skip) {
      await logIngest({ ...base, outcome: 'skipped', reason: 'not_team_relevant', duration_ms: Date.now() - started });
      return json({ ok: true, skipped: true, reason: 'not_team_relevant' });
    }

    const { data: ctx, error: ctxErr } = await db
      .from('context')
      .insert({
        project_id, member, summary: result.summary,
        summary_plain: result.summaryPlain, work_label: result.workLabel,
        session_id, branch,
      })
      .select('id').single();

    if (ctxErr) {
      if (ctxErr.code === '23505') {
        await logIngest({ ...base, outcome: 'skipped', reason: 'duplicate', duration_ms: Date.now() - started });
        return json({ ok: true, skipped: true, reason: 'duplicate' });
      }
      throw ctxErr;
    }

    let decisionCount = 0;
    if (result.decisions.length > 0) {
      const rows = result.decisions.map((d) => ({
        project_id, question: d.question, options: d.options, source_context_id: ctx.id,
      }));
      const { error } = await db.from('decisions').insert(rows);
      if (!error) decisionCount = rows.length;
    }

    await logIngest({
      ...base, outcome: 'created', context_id: ctx.id,
      decisions: decisionCount, duration_ms: Date.now() - started,
    });
    return json({ ok: true, skipped: false, context_id: ctx.id, decisions: decisionCount });
  } catch (err) {
    console.error('[ingest]', err);
    await logIngest({
      ...base, outcome: 'error',
      reason: err instanceof Error ? err.message.slice(0, 200) : 'unknown',
      duration_ms: Date.now() - started,
    });
    return json({ ok: false, error: 'server_error' }, 500);   // → 훅이 pending 큐에 넣고 재시도
  }
}
