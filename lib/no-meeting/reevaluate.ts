import { serverClient } from '../supabase';
import { evaluate } from './engine';
import { newId, persistEvaluation } from './persist';
import { loadNoMeeting } from './queries';
import type { Evaluation, MeetingRequest } from './types';

/**
 * 자동 재판정 — 근거가 바뀌면 다시 본다.
 *
 * 해결 로그의 `followUpCondition` 은 지금까지 문장으로만 있었다. 실행하는 곳이 여기다.
 * 새 세션 요약이 들어오면(= 근거가 바뀌면) 아직 열리지 않은 회의를 다시 판정한다.
 *
 * 두 가지를 지킨다:
 *   - **결론이 그대로면 아무것도 남기지 않는다.** 안 바뀐 판정을 원장에 계속 쌓으면
 *     "무엇이 바뀌었나" 를 되짚을 수 없다.
 *   - **사람이 이미 손댄 것은 건드리지 않는다.** 결정했거나 되돌린 판정은 그대로 둔다.
 */
export async function reevaluateOpen(projectId: string): Promise<{ changed: number }> {
  const db = serverClient();
  const nowIso = new Date().toISOString();

  // 아직 열리지 않았고, 사람이 손대지 않았고, 이미 없앤 것도 아닌 판정.
  const { data: rows } = await db
    .from('evaluations')
    .select('id, request_id, payload, decision_status, outcome')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(30);

  const targets = (rows ?? []).filter((r) => {
    if (r.decision_status === 'DECIDED' || r.decision_status === 'REVERTED') return false;
    if (r.outcome === 'DELETE') return false;
    const ev = r.payload as Evaluation;
    return ev.scheduledAt > nowIso;
  });
  if (targets.length === 0) return { changed: 0 };

  // 같은 요청에 판정이 여러 건이면 최신 것만 본다.
  const latest = new Map<string, (typeof targets)[number]>();
  for (const t of targets) if (!latest.has(t.request_id)) latest.set(t.request_id, t);

  const { data: reqRows } = await db
    .from('meeting_requests').select('*')
    .eq('project_id', projectId).in('id', [...latest.keys()]);
  if (!reqRows || reqRows.length === 0) return { changed: 0 };

  const data = await loadNoMeeting(projectId);
  let changed = 0;

  for (const r of reqRows) {
    const prev = latest.get(r.id);
    if (!prev) continue;
    const before = prev.payload as Evaluation;

    const request: MeetingRequest = {
      id: r.id,
      source: r.source === 'CALENDAR' ? 'CALENDAR' : 'REQUEST',
      title: r.title,
      purposeText: r.purpose_text,
      scheduledAt: r.scheduled_at,
      requestedBy: r.requested_by,
      attendeeCandidates: r.attendee_candidates ?? [],
      plannedMinutes: r.planned_minutes,
      createdAt: r.created_at,
      agenda: r.agenda ?? [],
      typeCandidates: r.type_candidates ?? [],
      typeRationale: r.type_rationale,
      explicitTypeMarker: r.explicit_type_marker ?? null,
      patternKey: r.pattern_key ?? null,
    };

    const evidence = data.evidenceByRequest[request.id] ?? [];
    const next = evaluate({
      request,
      evidence,
      droppedSources: data.droppedByRequest[request.id] ?? [],
      activePolicies: data.policies,
      responseStats: data.responseStats,
      now: Date.now(),
      id: newId('ev'),
    });

    // 결론과 조건이 그대로면 남기지 않는다.
    const sameOutcome = next.outcome === before.outcome;
    const sameGates = gateSignature(next) === gateSignature(before);
    if (sameOutcome && sameGates) continue;

    await persistEvaluation(projectId, request, next, sameOutcome
      ? '근거가 바뀌어 다시 판정했습니다. 결론은 같고 조건이 달라졌습니다.'
      : `근거가 바뀌어 결론이 ${before.outcome ?? '미분류'} → ${next.outcome ?? '미분류'} 로 바뀌었습니다.`);
    changed += 1;
  }

  return { changed };
}

/** 조건이 실제로 달라졌는지 비교하기 위한 지문. */
function gateSignature(ev: Evaluation): string {
  return ev.gateChecks.map((g) => `${g.key}:${g.status}`).join('|');
}
