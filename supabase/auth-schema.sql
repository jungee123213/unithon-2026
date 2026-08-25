-- TeamSync 인증 · 프로젝트 · 멤버십
--
-- 설계 문서 §4 는 "인증·권한 UI"를 W(이번엔 안 함)로 잘랐다. 이 파일은 그 결정을
-- 뒤집는다 — 여러 사람이 실제로 참여해서 테스트하려면 필요하다.
--
-- 핵심 변경: 팀 공유 시크릿 하나 → **멤버별 훅 토큰**.
--   토큰이 (project_id, member) 를 결정하므로 훅이 그 둘을 보낼 필요가 없어지고,
--   남의 프로젝트에 밀어넣는 경로가 원천적으로 사라진다.
--
-- 재실행 안전(idempotent).

-- ─────────────────────────────────────────────────────────────
-- profiles : auth.users 의 표시용 확장
-- ─────────────────────────────────────────────────────────────
create table if not exists profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text        not null,
  created_at   timestamptz not null default now()
);

-- 가입하면 프로필이 자동으로 생긴다. 이메일 앞부분을 기본 이름으로.
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ─────────────────────────────────────────────────────────────
-- projects
-- ─────────────────────────────────────────────────────────────
create table if not exists projects (
  id          text        primary key,          -- URL 에 쓰인다. context.project_id 와 같은 값
  name        text        not null,
  owner_id    uuid        not null references auth.users(id) on delete cascade,
  join_code   text        not null unique,      -- 참여 코드. 6자
  created_at  timestamptz not null default now()

  -- GitHub 연동은 넣지 않는다. 범위를 가르는 것은 폴더(.claude/settings.json)이고
  -- git 은 판정 재료(L2 브랜치·머지 상태)일 뿐이다 — 설계 문서 §5.5 "git 무관".
  -- 리모트가 없는 로컬 폴더에서도 동작해야 한다.
);

create index if not exists projects_owner_idx on projects (owner_id);

-- ─────────────────────────────────────────────────────────────
-- project_members : 참여 + 훅 토큰
-- ─────────────────────────────────────────────────────────────
create table if not exists project_members (
  project_id   text        not null references projects(id) on delete cascade,
  user_id      uuid        not null references auth.users(id) on delete cascade,
  display_name text        not null,            -- context.member 에 그대로 쓰인다
  hook_token   text        not null unique,     -- 이 사람 이 프로젝트 전용
  role         text        not null default 'member',  -- owner | member
  joined_at    timestamptz not null default now(),
  primary key (project_id, user_id)
);

create index if not exists project_members_token_idx on project_members (hook_token);
create index if not exists project_members_user_idx  on project_members (user_id);

-- ─────────────────────────────────────────────────────────────
-- ingest_log : 디버깅 창의 소스
--
-- 훅은 detach 되어 응답을 읽지 않는다. 무엇이 도착했고 왜 버려졌는지 볼 방법이
-- 서버 로그밖에 없었다. 이 테이블이 그 창이다 — 요약이 만들어지지 '않은' 경우가
-- 오히려 더 중요하다(팀 무관 판정·길이 미달·중복).
-- ─────────────────────────────────────────────────────────────
create table if not exists ingest_log (
  id            bigserial   primary key,
  project_id    text,
  member        text,
  session_id    text,
  branch        text,
  turn_count    int,
  total_chars   int,
  outcome       text        not null,   -- created | skipped | rejected | error
  reason        text,                   -- not_team_relevant | too_short | duplicate | unauthorized | ...
  context_id    bigint,
  decisions     int         not null default 0,
  duration_ms   int,
  created_at    timestamptz not null default now()
);

create index if not exists ingest_log_project_idx on ingest_log (project_id, id desc);

-- 오래된 로그는 남겨둘 이유가 없다. 조회는 최근 것만 한다.
create index if not exists ingest_log_time_idx on ingest_log (created_at desc);

-- ─────────────────────────────────────────────────────────────
-- Realtime
-- ─────────────────────────────────────────────────────────────
do $$
begin
  begin execute 'alter publication supabase_realtime add table ingest_log';      exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table project_members'; exception when duplicate_object then null; end;
end $$;

-- ─────────────────────────────────────────────────────────────
-- RLS
--   · 쓰기는 전부 service_role(API Route)만.
--   · 읽기는 로그인 사용자가 자기가 속한 프로젝트만.
--   · hook_token 은 anon 에게 절대 노출되면 안 된다 → project_members 는 anon 차단.
-- ─────────────────────────────────────────────────────────────
alter table profiles        enable row level security;
alter table projects        enable row level security;
alter table project_members enable row level security;
alter table ingest_log      enable row level security;

drop policy if exists own_profile          on profiles;
drop policy if exists member_reads_project on projects;
drop policy if exists member_reads_members on project_members;
drop policy if exists member_reads_log     on ingest_log;

create policy own_profile on profiles
  for select to authenticated using (id = auth.uid());

create policy member_reads_project on projects
  for select to authenticated using (
    exists (select 1 from project_members m
            where m.project_id = projects.id and m.user_id = auth.uid())
  );

-- 같은 프로젝트 멤버 목록은 보이되, hook_token 컬럼은 API Route 를 통해서만 나간다.
create policy member_reads_members on project_members
  for select to authenticated using (
    exists (select 1 from project_members m
            where m.project_id = project_members.project_id and m.user_id = auth.uid())
  );

create policy member_reads_log on ingest_log
  for select to authenticated using (
    exists (select 1 from project_members m
            where m.project_id = ingest_log.project_id and m.user_id = auth.uid())
  );
