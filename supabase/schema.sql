-- TeamSync 스키마 — 설계 문서 §5.5
-- Supabase(서울 리전) SQL Editor에 통째로 붙여넣는다.
-- 재실행 안전(idempotent).

-- ─────────────────────────────────────────────────────────────
-- context : 에이전트 세션 요약 1건 = 1행
-- ─────────────────────────────────────────────────────────────
create table if not exists context (
  id          bigserial primary key,   -- uuid 금지: 워터마크 비교가 시간순이어야 함
  project_id  text        not null,
  member      text        not null,
  summary       text      not null,            -- 동료 에이전트용
  summary_plain text,                           -- 비개발자용 (진행사항 문서)
  work_label    text,                           -- 이 브랜치가 무슨 일인지 한 줄
  session_id  text,                    -- ingest 멱등키 (계약 §1)
  branch      text,                    -- L2 판정 결과 기록 (감사용)
  created_at  timestamptz not null default now()
);

-- 멱등성: 같은 세션이 두 번 들어오면 두 번째는 무시된다 (재시도 안전)
create unique index if not exists context_session_uniq
  on context (project_id, session_id) where session_id is not null;

create index if not exists context_project_id_idx on context (project_id, id);

alter table context add column if not exists summary_plain text;
alter table context add column if not exists work_label text;

-- ─────────────────────────────────────────────────────────────
-- branches : 진행사항 문서의 상태 근거. 전부 git 이 알려준 사실이다.
--            추정값을 넣지 않는다 — 넣는 순간 §5.4 의 방어선이 무너진다.
-- ─────────────────────────────────────────────────────────────
create table if not exists branches (
  project_id  text        not null,
  branch      text        not null,
  merged      boolean     not null default false,  -- 기준 브랜치에 들어갔는가
  reported_by text,                                -- 마지막으로 이 사실을 보고한 멤버
  updated_at  timestamptz not null default now(),
  primary key (project_id, branch)
);

-- ─────────────────────────────────────────────────────────────
-- injections : 워터마크 + 카운터의 유일한 소스
-- ─────────────────────────────────────────────────────────────
create table if not exists injections (
  id          bigserial primary key,
  project_id  text        not null,
  member      text        not null,            -- 주입받은 쪽
  context_id  bigint      not null references context(id) on delete cascade,
  batch_id    uuid,                                -- 같은 SessionStart 에서 함께 주입된 묶음
  rendered    text,                                -- FR-5.1 · 실제로 주입된 문자열 그 자체
  injected_at timestamptz not null default now()
);

-- 같은 사람에게 같은 컨텍스트를 두 번 기록하지 않는다 (FR-3.3)
create unique index if not exists injections_uniq
  on injections (project_id, member, context_id);

create index if not exists injections_watermark_idx
  on injections (project_id, member, context_id desc);

create index if not exists injections_batch_idx
  on injections (project_id, injected_at desc);

-- 기존 테이블에 나중에 붙일 때도 안전하게
alter table injections add column if not exists batch_id uuid;
alter table injections add column if not exists rendered text;

-- ─────────────────────────────────────────────────────────────
-- decisions : 사람이 판단해야 하는 것만 (FR-4)
-- ─────────────────────────────────────────────────────────────
create table if not exists decisions (
  id                bigserial primary key,
  project_id        text        not null,
  question          text        not null,
  options           jsonb,
  status            text        not null default 'open',   -- open | resolved
  resolved_choice   text,
  source_context_id bigint      references context(id) on delete set null,
  created_at        timestamptz not null default now()
);

create index if not exists decisions_project_idx on decisions (project_id, status, id desc);

-- ─────────────────────────────────────────────────────────────
-- Realtime (FR-5.4)
-- ─────────────────────────────────────────────────────────────
do $$
begin
  begin execute 'alter publication supabase_realtime add table context';    exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table injections'; exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table decisions';  exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table branches';   exception when duplicate_object then null; end;
end $$;

-- ─────────────────────────────────────────────────────────────
-- RLS : 프론트(anon)는 읽기만. 쓰기는 service_role(API Route)만.
--       §4 "이번에 하지 않는 것 = 인증·권한 UI" 를 지키면서 키 노출만 막는다.
-- ─────────────────────────────────────────────────────────────
alter table context    enable row level security;
alter table injections enable row level security;
alter table decisions  enable row level security;
alter table branches   enable row level security;

drop policy if exists anon_read_context    on context;
drop policy if exists anon_read_injections on injections;
drop policy if exists anon_read_decisions  on decisions;

create policy anon_read_context    on context    for select to anon using (true);
create policy anon_read_injections on injections for select to anon using (true);
create policy anon_read_decisions  on decisions  for select to anon using (true);
drop policy if exists anon_read_branches on branches;
create policy anon_read_branches   on branches   for select to anon using (true);
