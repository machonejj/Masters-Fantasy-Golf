-- ============================================================================
--  Masters Fantasy Golf — Supabase schema
--  Run this in the Supabase SQL editor (Dashboard → SQL → New query).
--  Safe to re-run: it drops and recreates the app objects.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Clean slate
-- ---------------------------------------------------------------------------
drop table if exists public.picks         cascade;
drop table if exists public.participants  cascade;
drop table if exists public.golfers       cascade;
drop table if exists public.draft_state   cascade;
drop table if exists public.profiles      cascade;
drop function if exists public.handle_new_user() cascade;

-- ---------------------------------------------------------------------------
-- profiles — one row per authenticated user (mirror of auth.users)
-- The FIRST account to sign up is automatically made the admin.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text,
  display_name text not null default 'Player',
  is_admin     boolean not null default false,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- draft_state — single global row holding draft status + pool settings
-- ---------------------------------------------------------------------------
create table public.draft_state (
  id                       int primary key default 1 check (id = 1),
  status                   text not null default 'pending'
                             check (status in ('pending','active','paused','complete')),
  current_pick             int not null default 0,           -- zero-based overall pick index
  pick_deadline            timestamptz,                       -- when the current pick auto-fires
  paused_remaining_seconds int,                               -- clock remaining while paused
  golfers_per_team         int not null default 6,
  counting_scores          int not null default 3,            -- best N of golfers_per_team
  cut_penalty              int not null default 16,
  course_par               int not null default 72,
  pick_timer_seconds       int not null default 0,            -- 0 = no timer (admin can set one)
  tournament_name          text not null default 'The Masters',
  event_id                 text,                              -- ESPN event id the pool is set to (null = follow current)
  -- Pre-tournament purse log (the pot for the active tournament). Editable by the
  -- admin until the tournament is closed; snapshotted into `tournaments` on close.
  buy_in                   numeric not null default 0,        -- entry fee per patron
  paid_count               int not null default 0,            -- patrons entered (paid)
  payout_structure         text not null default 'winner_take_all',
  purse_notes              text,
  closed_at                timestamptz,                       -- set when added to The Gallery (blocks re-closing)
  updated_at               timestamptz not null default now()
);

insert into public.draft_state (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- golfers — the field. Scores are per-round; store to-par or raw strokes.
-- ---------------------------------------------------------------------------
create table public.golfers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  rank       int,
  odds       text,
  status     text not null default 'active'    -- active | cut | wd
               check (status in ('active','cut','wd')),
  r1         numeric,
  r2         numeric,
  r3         numeric,
  r4         numeric,
  thru       text,                              -- live: holes played this round
  today      text,                              -- live: today's to-par
  created_at timestamptz not null default now()
);
create index golfers_rank_idx on public.golfers (rank);

-- ---------------------------------------------------------------------------
-- participants — the teams in the draft (a profile + snake order)
-- ---------------------------------------------------------------------------
create table public.participants (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references public.profiles(id) on delete set null,
  display_name  text not null,
  draft_position int not null,
  -- "Sitting out" this tournament: the player stays in the pool (account, code,
  -- and season membership persist) but is skipped for the current tournament's
  -- draft, standings, and live feed. Toggled by the admin between tournaments.
  sitting_out   boolean not null default false,
  created_at    timestamptz not null default now()
);
create unique index participants_position_idx on public.participants (draft_position);

-- ---------------------------------------------------------------------------
-- picks — one row per drafted golfer
-- ---------------------------------------------------------------------------
create table public.picks (
  id             uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants(id) on delete cascade,
  golfer_id      uuid not null references public.golfers(id) on delete restrict,
  pick_number    int not null,
  created_at     timestamptz not null default now()
);
create unique index picks_golfer_idx       on public.picks (golfer_id);   -- a golfer can be drafted once
create unique index picks_pick_number_idx  on public.picks (pick_number);

-- ---------------------------------------------------------------------------
-- tournaments — "The Gallery": a permanent snapshot of each completed
-- tournament. Written once when the admin closes a tournament; never edited by
-- the client. The full final standings (per team + per drafted golfer) live in
-- `standings` jsonb so career stats survive even if golfers/picks are cleared
-- for the next tournament. Career earnings / wins / made-cut rate are computed
-- by aggregating these rows.
-- ---------------------------------------------------------------------------
create table public.tournaments (
  id                      uuid primary key default gen_random_uuid(),
  event_id                text,
  name                    text not null,
  completed_at            timestamptz not null default now(),
  course_par              int,
  counting_scores         int,
  golfers_per_team        int,
  buy_in                  numeric not null default 0,
  paid_count              int not null default 0,
  purse                   numeric not null default 0,
  payout_structure        text not null default 'winner_take_all',
  notes                   text,
  champion_participant_id uuid,        -- nullable: the team may be removed later
  champion_name           text,
  -- [{ participant_id, name, position, score, winnings,
  --    golfers: [{ name, status, made_cut, total, counted }] }]
  standings               jsonb not null default '[]'::jsonb,
  created_at              timestamptz not null default now()
);
create index tournaments_completed_idx on public.tournaments (completed_at desc);

-- ---------------------------------------------------------------------------
-- New-user trigger: create a profile, first signup becomes admin
-- ---------------------------------------------------------------------------
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  first_user boolean;
begin
  select count(*) = 0 into first_user from public.profiles;
  insert into public.profiles (id, email, display_name, is_admin)
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data->>'display_name',''), split_part(new.email,'@',1)),
    first_user
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security
--   Reads: any authenticated user (needed for leaderboard / draft / realtime).
--   Writes to golfers / participants / picks / draft_state: NONE from the
--   client — all go through Next.js API routes using the service-role key,
--   which bypasses RLS after validating the caller server-side.
-- ---------------------------------------------------------------------------
alter table public.profiles     enable row level security;
alter table public.draft_state  enable row level security;
alter table public.golfers      enable row level security;
alter table public.participants enable row level security;
alter table public.picks        enable row level security;
alter table public.tournaments  enable row level security;

create policy "profiles readable by authenticated"
  on public.profiles for select to authenticated using (true);
-- No client-side profile writes: profiles are created by the new-user trigger
-- and only ever updated server-side via the service-role key. Deliberately NOT
-- granting an update policy here, so a logged-in user can't promote themselves
-- to admin (is_admin) from the browser.

create policy "draft_state readable by authenticated"
  on public.draft_state for select to authenticated using (true);
create policy "golfers readable by authenticated"
  on public.golfers for select to authenticated using (true);
create policy "participants readable by authenticated"
  on public.participants for select to authenticated using (true);
create policy "picks readable by authenticated"
  on public.picks for select to authenticated using (true);
create policy "tournaments readable by authenticated"
  on public.tournaments for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Realtime — broadcast changes so the draft board / leaderboard live-update
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.draft_state;
alter publication supabase_realtime add table public.picks;
alter publication supabase_realtime add table public.participants;
alter publication supabase_realtime add table public.golfers;
alter publication supabase_realtime add table public.tournaments;

-- ============================================================================
--  Tips
--  • Promote another admin:   update public.profiles set is_admin = true
--                             where email = 'you@example.com';
--  • The golfer field is seeded from the Admin panel ("Load default field").
-- ============================================================================
