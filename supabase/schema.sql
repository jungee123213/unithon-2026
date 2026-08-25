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

-- ─────────────────────────────────────────────────────────────
-- NO MEETING · 회의 판정
--
-- 사람이 올리는 것은 **주장**(meeting_requests)이고, 판정에 쓰이는 사실은
-- 커넥터가 준다. 그래서 요청 테이블에는 게이트 입력값이 하나도 없다.
-- ─────────────────────────────────────────────────────────────
create table if not exists meeting_requests (
  id            text        primary key,
  project_id    text        not null,
  source        text        not null default 'REQUEST',   -- REQUEST | CALENDAR
  title         text        not null,
  purpose_text  text        not null default '',
  scheduled_at  timestamptz not null,
  requested_by  text        not null,
  attendee_candidates jsonb  not null default '[]'::jsonb,
  planned_minutes int        not null default 30,

  -- 이 회의가 다루는 대상 (이슈키 · 브랜치 · 서비스명).
  -- 신청자에게 요구하지 않는다 — 제목·본문에 이미 적혀 있으면 뽑고, 없으면 비어 있다.
  -- 비어 있어도 참석자 축으로 근거가 붙는다 (lib/no-meeting/scope.ts).
  scope_keys    jsonb       not null default '[]'::jsonb,

  -- 분류기 산출. 신청자가 쓴 값이 아니다.
  agenda            jsonb   not null default '[]'::jsonb,
  type_candidates   jsonb   not null default '[]'::jsonb,
  type_rationale    text    not null default '',
  explicit_type_marker text,
  pattern_key       text,

  status        text        not null default 'PENDING',   -- PENDING | EVALUATED
  created_at    timestamptz not null default now()
);

-- 이미 만들어진 DB 에도 붙는다.
alter table meeting_requests add column if not exists scope_keys jsonb not null default '[]'::jsonb;

create index if not exists meeting_requests_project_idx
  on meeting_requests (project_id, status, scheduled_at);

-- 판정 한 건. 스냅샷이므로 통째로 보관한다 — 그때 무엇을 보고 그렇게 판정했는지가
-- 나중에 규칙이 바뀌어도 남아 있어야 한다.
create table if not exists evaluations (
  id              text        primary key,
  project_id      text        not null,
  request_id      text        not null references meeting_requests(id) on delete cascade,
  meeting_type    text        not null,
  outcome         text,
  decision_status text,
  pattern_key     text,
  selected_option_key text,
  rule_version    text        not null,
  payload         jsonb       not null,      -- Evaluation 전체
  created_at      timestamptz not null default now()
);

create index if not exists evaluations_project_idx on evaluations (project_id, created_at desc);
create index if not exists evaluations_pending_idx
  on evaluations (project_id, decision_status) where decision_status = 'PENDING';

-- 원장. 기록을 지우지 않는다 — 되돌림도 이벤트를 하나 더 붙일 뿐이다.
create table if not exists nm_ledger (
  id            text        primary key,
  project_id    text        not null,
  event_type    text        not null,        -- EVALUATED | DECIDED | REVERTED | POLICY_ACTIVATED
  outcome       text,
  actor         text        not null,
  title         text        not null,
  summary       text        not null default '',
  occurred_at   timestamptz not null default now(),
  evaluation_id text,
  rule_version  text        not null,
  pattern_key   text,
  selected_option_key text
);

create index if not exists nm_ledger_project_idx on nm_ledger (project_id, occurred_at desc);
create index if not exists nm_ledger_pattern_idx on nm_ledger (project_id, pattern_key, selected_option_key);

-- 정책. **사람이 승격시킨 것만 들어온다.**
-- 후보는 저장하지 않는다 — 원장에서 같은 판단이 몇 번 반복됐는지 세면 나오기 때문이다.
create table if not exists nm_policies (
  id            text        primary key,
  project_id    text        not null,
  pattern_key   text        not null,
  selected_option_key text  not null,
  title         text        not null,
  rule          text        not null,
  exception     text,
  activated_by  text        not null,
  activated_at  timestamptz not null default now()
);

create unique index if not exists nm_policies_pattern_uniq
  on nm_policies (project_id, pattern_key, selected_option_key);

-- 커넥터 연결 상태.
create table if not exists nm_connections (
  project_id    text        not null,
  connector_id  text        not null,
  status        text        not null default 'DISCONNECTED',
  account_label text,
  connected_at  timestamptz,
  last_sync_at  timestamptz,
  primary key (project_id, connector_id)
);

-- ─────────────────────────────────────────────────────────────
-- 커넥터 자격증명.
--
-- **nm_connections 와 일부러 분리한 테이블이다.** nm_connections 에는
-- `anon` 이 select 하는 정책이 걸려 있어서(아래) 같은 테이블에 토큰을 두면
-- 브라우저 키로 읽힌다. 여기는 정책을 하나도 만들지 않는다 — RLS 가 켜져 있고
-- 정책이 없으면 anon 은 한 줄도 못 읽는다. 서버(service_role)만 RLS 를 우회한다.
--
-- Jira · Sentry 는 프로젝트당 한 줄이면 된다. 한 사람(가급적 봇 계정)이
-- 한 번 붙이면 팀 전체가 그 권한으로 읽는다. 캘린더는 사람마다 자기 것을 보므로
-- 이 구조로 안 된다 — 그건 붙일 때 따로 설계한다.
-- ─────────────────────────────────────────────────────────────
create table if not exists nm_secrets (
  project_id    text        not null,
  connector_id  text        not null,
  -- 접속 정보 + 사람 매핑. 토큰이 여기 들어 있으므로 절대 클라이언트로 내보내지 않는다.
  config        jsonb       not null default '{}'::jsonb,
  updated_at    timestamptz not null default now(),
  primary key (project_id, connector_id)
);

alter table nm_secrets enable row level security;
revoke all on nm_secrets from anon;
revoke all on nm_secrets from authenticated;

-- 결정 인박스 통합 (§M3): 훅이 뽑은 결정과 회의 판정이 만든 결정 카드가
-- 같은 큐에 들어온다. 인박스가 두 개면 "사람에게 올린다" 가 성립하지 않는다.
alter table decisions add column if not exists evaluation_id text;
alter table decisions add column if not exists why_you text;
alter table decisions add column if not exists decider text;
alter table decisions add column if not exists due_at timestamptz;

create index if not exists decisions_evaluation_idx on decisions (evaluation_id);

alter table meeting_requests enable row level security;
alter table evaluations      enable row level security;
alter table nm_ledger        enable row level security;
alter table nm_policies      enable row level security;
alter table nm_connections   enable row level security;

drop policy if exists anon_read_meeting_requests on meeting_requests;
drop policy if exists anon_read_evaluations      on evaluations;
drop policy if exists anon_read_nm_ledger        on nm_ledger;
drop policy if exists anon_read_nm_policies      on nm_policies;
drop policy if exists anon_read_nm_connections   on nm_connections;

create policy anon_read_meeting_requests on meeting_requests for select to anon using (true);
create policy anon_read_evaluations      on evaluations      for select to anon using (true);
create policy anon_read_nm_ledger        on nm_ledger        for select to anon using (true);
create policy anon_read_nm_policies      on nm_policies      for select to anon using (true);
create policy anon_read_nm_connections   on nm_connections   for select to anon using (true);

do $$
begin
  begin execute 'alter publication supabase_realtime add table evaluations'; exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table meeting_requests'; exception when duplicate_object then null; end;
end $$;
