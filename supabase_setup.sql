-- ══════════════════════════════════════════════════
-- inkcanvas (Quillpen) — Supabase 전체 스키마 설정
-- 테이블명: q_canvases, q_widgets (q_ 접두사 적용)
-- Supabase 대시보드 → SQL Editor에서 전체 실행
-- ══════════════════════════════════════════════════

-- ── 1. q_canvases 테이블 ──────────────────────────────
create table if not exists q_canvases (
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

-- ── 2. q_widgets 테이블 ───────────────────────────────
create table if not exists q_widgets (
  id         text primary key,          -- nanoid
  canvas_id  uuid references q_canvases not null,
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
create index if not exists q_canvases_user_id_idx   on q_canvases (user_id);
create index if not exists q_canvases_share_idx      on q_canvases (share_token) where share_token is not null;
create index if not exists q_widgets_canvas_id_idx  on q_widgets (canvas_id);
create index if not exists q_widgets_user_id_idx    on q_widgets (user_id);

-- ── 4. RLS (Row Level Security) 활성화 ──────────────
alter table q_canvases enable row level security;
alter table q_widgets   enable row level security;

-- ── 5. q_canvases RLS 정책 ────────────────────────────
-- 내 캔버스 CRUD
create policy "q_canvases: own" on q_canvases
  for all using (auth.uid() = user_id);

-- Phase 3: 공유 링크 — 비로그인 읽기 허용
-- 보안 강화: share_token이 반드시 존재해야 조회 가능
-- (share_enabled=true만으로 전체 목록 조회 방지)
create policy "q_canvases: shared read" on q_canvases
  for select using (
    share_enabled = true
    and share_token is not null
  );

-- ── 6. q_widgets RLS 정책 ─────────────────────────────
-- 내 위젯 CRUD
create policy "q_widgets: own" on q_widgets
  for all using (auth.uid() = user_id);

-- Phase 3: 공유된 캔버스의 위젯 읽기 허용 (share_token 존재 필수)
create policy "q_widgets: shared read" on q_widgets
  for select using (
    exists (
      select 1 from q_canvases c
      where c.id = q_widgets.canvas_id
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

create trigger q_canvases_updated_at
  before update on q_canvases
  for each row execute function update_updated_at();

create trigger q_widgets_updated_at
  before update on q_widgets
  for each row execute function update_updated_at();

-- ── 8. Realtime 활성화 ──────────────────────────────
-- Supabase 대시보드 → Database → Replication 에서
-- q_widgets 테이블의 INSERT / UPDATE / DELETE 활성화 필요
-- (SQL로는 불가, 대시보드에서 직접 설정)

-- ══════════════════════════════════════════════════
-- ⚠️ 보안 주의 (2026-07 감사에서 발견)
-- 위 5·6번의 "shared read" RLS 정책은 토큰을 몰라도
--   select * from q_canvases  (anon 키만으로)
-- 를 실행하면 share_enabled=true인 "모든" 캔버스와 share_token까지
-- 통째로 조회됩니다. RLS는 클라이언트의 .eq() 필터를 강제할 수 없기
-- 때문에, 공유 토큰이 사실상 공개 목록이 됩니다.
--
-- 개인 사용 수준에서는 위험이 낮지만, 강화하려면 아래처럼
-- SELECT 정책을 제거하고 SECURITY DEFINER 함수로만 조회를 허용하세요.
-- (적용 시 js/share.js의 직접 select 호출을 RPC 호출로 바꿔야 하며,
--  공유 뷰어의 Realtime 구독은 동작하지 않게 됩니다 — 트레이드오프)
--
-- drop policy "q_canvases: shared read" on q_canvases;
-- drop policy "q_widgets: shared read" on q_widgets;
--
-- create or replace function get_shared_canvas(p_token text)
-- returns setof q_canvases language sql security definer stable as $$
--   select * from q_canvases
--   where share_token = p_token and share_enabled = true;
-- $$;
--
-- create or replace function get_shared_widgets(p_token text)
-- returns setof q_widgets language sql security definer stable as $$
--   select w.* from q_widgets w
--   join q_canvases c on c.id = w.canvas_id
--   where c.share_token = p_token and c.share_enabled = true;
-- $$;
--
-- 클라이언트 예시:
--   const { data } = await sb.rpc('get_shared_canvas', { p_token: shareId });

-- ══════════════════════════════════════════════════
-- 9. Daily Journal (일일 기록) — q_journal_pages / q_journal_blocks
--    기존 q_canvases / q_widgets(자유 페이지)와 완전히 분리된 신규 테이블.
--    Supabase 대시보드 → SQL Editor에서 실행하세요.
-- ══════════════════════════════════════════════════

-- 날짜별 일기 페이지. 사용자당 날짜 하나만 존재 (unique 제약)
create table if not exists q_journal_pages (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null,
  entry_date  date not null,
  title       text not null default '',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  unique (user_id, entry_date)
);

-- 페이지 안의 시간순 블록. id는 클라이언트(nanoid)에서 생성해 q_widgets와 동일한 upsert 패턴 사용
create table if not exists q_journal_blocks (
  id          text primary key,
  page_id     uuid references q_journal_pages(id) on delete cascade not null,
  user_id     uuid references auth.users not null,
  type        text not null,             -- text | image | (future: audio, handwriting)
  data        jsonb not null default '{}',
  sort_order  int not null default 0,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- 인덱스
create index if not exists q_journal_pages_user_date_idx on q_journal_pages (user_id, entry_date);
create index if not exists q_journal_blocks_page_id_idx  on q_journal_blocks (page_id);
create index if not exists q_journal_blocks_user_id_idx  on q_journal_blocks (user_id);
create index if not exists q_journal_blocks_created_idx  on q_journal_blocks (page_id, created_at);

-- RLS 활성화
alter table q_journal_pages  enable row level security;
alter table q_journal_blocks enable row level security;

-- 본인 소유 페이지/블록만 CRUD 가능 (공유 기능 없음 — 기존 공유 정책을 확장하지 않음)
create policy "q_journal_pages: own" on q_journal_pages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "q_journal_blocks: own" on q_journal_blocks
  for all using (
    auth.uid() = user_id
    and exists (select 1 from q_journal_pages p where p.id = q_journal_blocks.page_id and p.user_id = auth.uid())
  ) with check (
    auth.uid() = user_id
    and exists (select 1 from q_journal_pages p where p.id = q_journal_blocks.page_id and p.user_id = auth.uid())
  );

-- updated_at 자동 갱신 트리거 (기존 update_updated_at() 함수 재사용)
create trigger q_journal_pages_updated_at
  before update on q_journal_pages
  for each row execute function update_updated_at();

create trigger q_journal_blocks_updated_at
  before update on q_journal_blocks
  for each row execute function update_updated_at();

-- Realtime은 이번 범위에서 필요 없음 (일기는 단일 사용자 시간순 기록이므로 폴링/온디맨드 로드로 충분)
-- 이미지 첨부는 기존 'quillpen-images' Storage 버킷을 재사용합니다 (파일명 접두사 journal- 로 구분).

-- ══════════════════════════════════════════════════
-- 10. 기존 테이블에서 마이그레이션 (이미 canvases/widgets가 있는 경우)
-- 아래를 Supabase SQL Editor에서 실행하세요.
-- ══════════════════════════════════════════════════
-- ALTER TABLE canvases RENAME TO q_canvases;
-- ALTER TABLE widgets RENAME TO q_widgets;
-- 
-- 참고: RLS 정책, 인덱스, 트리거는 테이블 이름 변경 시 자동으로 유지됩니다.
-- Realtime은 Supabase Dashboard → Database → Replication에서
-- q_widgets 테이블에 대해 재설정이 필요합니다.
