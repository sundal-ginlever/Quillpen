-- ══════════════════════════════════════════════════
-- inkcanvas — Supabase 전체 스키마 설정 (Phase 2 + 3)
-- Supabase 대시보드 → SQL Editor에서 전체 실행
-- ══════════════════════════════════════════════════

-- ── 1. canvases 테이블 ──────────────────────────────
create table if not exists canvases (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users not null,
  name          text not null default '새 캔버스',
  camera        jsonb default '{"x":0,"y":0,"zoom":1}',
  settings      jsonb default '{"showGrid":true,"snapOn":true}',
  -- Phase 3: 공유 링크
  share_enabled boolean not null default false,
  share_token   text unique,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- ── 2. widgets 테이블 ───────────────────────────────
create table if not exists widgets (
  id         text primary key,          -- nanoid
  canvas_id  uuid references canvases not null,
  user_id    uuid references auth.users not null,
  type       text not null,             -- memo | sketch | spreadsheet
  x          float8 not null default 0,
  y          float8 not null default 0,
  w          float8 not null default 200,
  h          float8 not null default 150,
  z_index    int not null default 0,
  data       jsonb not null default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ── 3. 인덱스 ──────────────────────────────────────
create index if not exists canvases_user_id_idx   on canvases (user_id);
create index if not exists canvases_share_idx      on canvases (share_token) where share_token is not null;
create index if not exists widgets_canvas_id_idx  on widgets (canvas_id);
create index if not exists widgets_user_id_idx    on widgets (user_id);

-- ── 4. RLS (Row Level Security) 활성화 ──────────────
alter table canvases enable row level security;
alter table widgets   enable row level security;

-- ── 5. canvases RLS 정책 ────────────────────────────
-- 내 캔버스 CRUD
create policy "canvases: own" on canvases
  for all using (auth.uid() = user_id);

-- Phase 3: 공유 링크 — 비로그인 읽기 허용
-- 보안 강화: share_token이 반드시 존재해야 조회 가능
-- (share_enabled=true만으로 전체 목록 조회 방지)
create policy "canvases: shared read" on canvases
  for select using (
    share_enabled = true
    and share_token is not null
  );

-- ── 6. widgets RLS 정책 ─────────────────────────────
-- 내 위젯 CRUD
create policy "widgets: own" on widgets
  for all using (auth.uid() = user_id);

-- Phase 3: 공유된 캔버스의 위젯 읽기 허용 (share_token 존재 필수)
create policy "widgets: shared read" on widgets
  for select using (
    exists (
      select 1 from canvases c
      where c.id = widgets.canvas_id
        and c.share_enabled = true
        and c.share_token is not null
    )
  );

-- ── 7. updated_at 자동 갱신 트리거 ─────────────────
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger canvases_updated_at
  before update on canvases
  for each row execute function update_updated_at();

create trigger widgets_updated_at
  before update on widgets
  for each row execute function update_updated_at();

-- ── 8. Realtime 활성화 ──────────────────────────────
-- Supabase 대시보드 → Database → Replication 에서
-- widgets 테이블의 INSERT / UPDATE / DELETE 활성화 필요
-- (SQL로는 불가, 대시보드에서 직접 설정)

-- ── 9. 기존 canvases에 share 컬럼 추가 (이미 실행한 경우) ──
-- alter table canvases add column if not exists share_enabled boolean not null default false;
-- alter table canvases add column if not exists share_token text unique;

-- ══════════════════════════════════════════════════
-- 10. 기존 배포 환경 보안 마이그레이션 (이미 테이블이 있는 경우)
-- 아래를 Supabase SQL Editor에서 실행하세요.
-- ══════════════════════════════════════════════════
-- drop policy if exists "canvases: shared read" on canvases;
-- create policy "canvases: shared read" on canvases
--   for select using (
--     share_enabled = true
--     and share_token is not null
--   );
--
-- drop policy if exists "widgets: shared read" on widgets;
-- create policy "widgets: shared read" on widgets
--   for select using (
--     exists (
--       select 1 from canvases c
--       where c.id = widgets.canvas_id
--         and c.share_enabled = true
--         and c.share_token is not null
--     )
--   );
