/**
 * T1(훅) ↔ T2(백엔드) ↔ T3(프론트) 공용 계약.
 * 문서: docs/CONTRACT.md · 설계 문서 §5.5
 *
 * 이 파일을 바꾸면 세 트랙이 같이 바뀐다. 그 외에는 서로를 기다리지 않는다.
 */

// ── DB 행 (T2 ↔ T3) ─────────────────────────────────────────────
export type ContextRow = {
  id: number;
  project_id: string;
  member: string;
  summary: string;            // 에이전트용 — 읽고 바로 행동을 바꿀 수 있게
  summary_plain: string | null; // 비개발자용 — 진행사항 문서가 쓴다
  work_label: string | null;    // 이 브랜치가 무슨 일인지 한 줄
  session_id: string | null;
  branch: string | null;
  created_at: string;
};

export type InjectionRow = {
  id: number;
  project_id: string;
  member: string;          // 주입받은 쪽
  context_id: number;
  batch_id: string | null;
  rendered: string | null;   // FR-5.1 · 실제로 주입된 문자열 그 자체
  injected_at: string;
};

export type DecisionRow = {
  id: number;
  project_id: string;
  question: string;
  options: DecisionOption[] | null;
  status: 'open' | 'resolved';
  resolved_choice: string | null;
  source_context_id: number | null;
  created_at: string;
};

export type DecisionOption = {
  label: string;
  rationale: string;       // FR-4.3 · 30초 안에 판단 가능하려면 근거가 붙어야 한다
};

// ── POST /api/ingest (T1 → T2) ──────────────────────────────────
export type IngestTurn = { ts: string; text: string };

export type IngestRequest = {
  project_id: string;
  member: string;
  session_id: string;      // 멱등키
  branch: string;
  turns: IngestTurn[];
  client_ts: string;
  force: boolean;
  /** git branch --merged 결과. 진행사항 문서의 상태 근거 — 추정이 아니다. */
  merged_branches?: string[];
};

export type BranchRow = {
  project_id: string;
  branch: string;
  merged: boolean;
  reported_by: string | null;
  updated_at: string;
};

export type IngestSkipReason =
  | 'not_team_relevant'    // L3 · 요약 LLM 이 {skip:true}
  | 'too_short'            // EX-6
  | 'duplicate'            // 같은 session_id 재전송
  | 'empty';

export type IngestResponse =
  | {
      ok: true; skipped: false; context_id: number; decisions: number;
      /** 근거가 바뀌어 다시 판정된 회의 수 (NO MEETING) */
      reevaluated?: number;
    }
  | { ok: true; skipped: true; reason: IngestSkipReason }
  | { ok: false; error: 'unauthorized' | 'invalid_body' | 'server_error' };

// ── GET /api/context (T2 → T1) ──────────────────────────────────
export type ContextItem = {
  context_id: number;
  member: string;
  summary: string;
  created_at: string;
};

export type ContextResponse =
  | { ok: true; count: number; injection: string; items: ContextItem[] }
  | { ok: false; error: 'unauthorized' | 'invalid_body' | 'server_error' };

// ── 요약 LLM 의 출력 (FR-4.1 · 단일 호출) ────────────────────────
export type SummaryResult =
  | { skip: true }
  | {
      skip?: false;
      summary: string;
      summaryPlain: string;
      workLabel: string;
      decisions: { question: string; options: DecisionOption[] }[];
    };

// ── 주입 상한 (§5.2) ────────────────────────────────────────────
export const INJECT_MAX_ITEMS = 5;
export const INJECT_MAX_CHARS = 2000;

// ── EX-6 · 잡음 세션 하한 ───────────────────────────────────────
export const MIN_TURN_CHARS = 300;
