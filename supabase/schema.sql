-- ============================================================
-- Mabar Kalam Kudus — Supabase schema
-- Paste ini ke Supabase SQL Editor lalu Run.
-- Aman dijalankan ulang (idempotent-ish via IF NOT EXISTS).
-- ============================================================

-- Enum tier
do $$ begin
  create type tier_enum as enum ('A', 'B', 'C');
exception when duplicate_object then null; end $$;

-- Enum mode skor
-- 'rally'       = rally point (setiap rally = 1 point pemenang)
-- 'traditional' = serve-based klasik (hanya server yang bisa nambah point; doubles = 2 serve per tim)
do $$ begin
  create type score_mode_enum as enum ('rally', 'traditional');
exception when duplicate_object then null; end $$;

-- ============================================================
-- Tabel: players
-- Master + state sesi (is_present, queue_joined_at, games_played)
-- ============================================================
create table if not exists public.players (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  tier          tier_enum not null,
  is_present    boolean not null default false,
  queue_joined_at timestamptz,
  games_played  integer not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists players_queue_idx
  on public.players (tier, queue_joined_at)
  where is_present = true and queue_joined_at is not null;

-- ============================================================
-- Tabel: current_match (singleton, 0 atau 1 row)
-- Live match yang sedang berlangsung.
-- games: array skor game-per-game yang sudah selesai [[21,15],[19,21],...]
-- ============================================================
create table if not exists public.current_match (
  id            uuid primary key default gen_random_uuid(),
  team1_ids     uuid[] not null,
  team2_ids     uuid[] not null,
  team1_snapshot jsonb not null,  -- [{name, tier}] snapshot saat mulai
  team2_snapshot jsonb not null,
  score_mode    score_mode_enum not null,
  target_points integer not null,   -- target normal, misal 21, 15, 30
  cap_points    integer not null,   -- batas atas (deuce cap). Sama dgn target = hard-stop tanpa deuce.
  win_by_two    boolean not null default true,   -- true utk rally BWF (deuce), false utk klasik
  best_of       integer not null default 1,   -- 1, 3, 5
  current_game  integer not null default 1,
  games         jsonb not null default '[]'::jsonb,  -- riwayat game selesai
  score1        integer not null default 0,
  score2        integer not null default 0,
  server_team   integer,   -- 1 atau 2, hanya utk traditional15
  server_number integer,   -- 1 atau 2 (serve pertama/kedua utk tim yang sama), utk traditional15
  started_at    timestamptz not null default now()
);

-- Enforce singleton via partial unique index (max 1 row)
create unique index if not exists current_match_singleton
  on public.current_match ((true));

-- ============================================================
-- Tabel: matches (history permanent)
-- ============================================================
create table if not exists public.matches (
  id             uuid primary key default gen_random_uuid(),
  team1_snapshot jsonb not null,
  team2_snapshot jsonb not null,
  score_mode     score_mode_enum not null,
  target_points  integer not null,
  cap_points     integer not null,
  win_by_two     boolean not null default true,
  best_of        integer not null,
  match_mode     text,                     -- 'balanced' | 'a-only' | 'bc-only' | 'mixed' (utk fairness alternation)
  games          jsonb not null,          -- [[21,15],[19,21],[21,17]]
  winner_team    integer,                  -- 1, 2, atau null (draw/aborted)
  finished_at    timestamptz not null default now()
);

create index if not exists matches_finished_idx on public.matches (finished_at desc);

-- ============================================================
-- Tabel: score_events (untuk undo)
-- Setiap perubahan skor simpan snapshot state SEBELUMNYA.
-- Undo = pop event terakhir, restore prev_state ke current_match.
-- ============================================================
create table if not exists public.score_events (
  id           bigserial primary key,
  match_id     uuid not null,
  prev_state   jsonb not null,  -- snapshot current_match sebelum event ini
  created_at   timestamptz not null default now()
);

create index if not exists score_events_match_idx
  on public.score_events (match_id, id desc);

-- ============================================================
-- RLS Policies
-- Viewer (anon) hanya boleh SELECT. Semua mutation lewat server (service key).
-- Service role otomatis bypass RLS — jadi tidak perlu policy INSERT/UPDATE.
-- ============================================================
alter table public.players enable row level security;
alter table public.current_match enable row level security;
alter table public.matches enable row level security;
alter table public.score_events enable row level security;

drop policy if exists "public read players" on public.players;
create policy "public read players" on public.players for select using (true);

drop policy if exists "public read current_match" on public.current_match;
create policy "public read current_match" on public.current_match for select using (true);

drop policy if exists "public read matches" on public.matches;
create policy "public read matches" on public.matches for select using (true);

drop policy if exists "public read score_events" on public.score_events;
create policy "public read score_events" on public.score_events for select using (true);

-- ============================================================
-- Realtime publication
-- Aktifkan broadcast perubahan ke client subscriber.
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'players'
  ) then
    alter publication supabase_realtime add table public.players;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'current_match'
  ) then
    alter publication supabase_realtime add table public.current_match;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'matches'
  ) then
    alter publication supabase_realtime add table public.matches;
  end if;
end $$;
