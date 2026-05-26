-- ============================================================================
--  The Gallery + Purse Log migration
--  Run once in Supabase → SQL Editor. Safe to re-run (idempotent).
-- ============================================================================

-- 1) Pre-tournament purse log, stored on the active tournament (draft_state).
alter table public.draft_state
  add column if not exists buy_in           numeric not null default 0,
  add column if not exists paid_count       int     not null default 0,
  add column if not exists payout_structure text    not null default 'winner_take_all',
  add column if not exists purse_notes      text,
  add column if not exists closed_at        timestamptz;

-- 2) The Gallery: a permanent snapshot of each completed tournament.
create table if not exists public.tournaments (
  id                      uuid primary key default gen_random_uuid(),
  event_id                text,
  name                    text not null,
  completed_at            timestamptz not null default now(),
  course_par              int,
  counting_scores         int,
  golfers_per_team        int,
  buy_in                  numeric not null default 0,
  paid_count              int     not null default 0,
  purse                   numeric not null default 0,
  payout_structure        text    not null default 'winner_take_all',
  notes                   text,
  champion_participant_id uuid,
  champion_name           text,
  standings               jsonb   not null default '[]'::jsonb,
  created_at              timestamptz not null default now()
);
create index if not exists tournaments_completed_idx on public.tournaments (completed_at desc);

-- 3) RLS: any authenticated user can read; all writes go through the
--    service-role API route (which bypasses RLS), never the browser.
alter table public.tournaments enable row level security;
do $$ begin
  create policy "tournaments readable by authenticated"
    on public.tournaments for select to authenticated using (true);
exception when duplicate_object then null; end $$;

-- 4) Realtime (optional) — let The Gallery live-update when a tournament closes.
do $$ begin
  alter publication supabase_realtime add table public.tournaments;
exception when duplicate_object then null; end $$;
