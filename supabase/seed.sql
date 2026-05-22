-- ============================================================================
--  Masters Fantasy Golf — DEMO seed data
--  Run AFTER schema.sql (Supabase → SQL Editor). Re-runnable.
--
--  Creates 4 guest teams, a 24-golfer scored field, a completed snake draft
--  (6 golfers each), and two cut golfers — so the Leaderboard / My Team / Golfers
--  pages show real data immediately. Guest teams have no login; to claim one as
--  your own, set its participants.user_id to your profile id, or just add
--  yourself as a participant from the Admin panel.
--
--  This wipes existing picks + participants. It UPSERTS the demo golfers by name,
--  so it overlays cleanly whether or not you've loaded the full field already.
-- ============================================================================

do $$
declare
  demo        record;
  gid         uuid;
  parts       uuid[];
  golfer_ids  uuid[] := '{}';
  n           int := 4;       -- teams
  rounds      int := 6;       -- golfers per team
  i           int;
  rnd         int;
  pos         int;
  idx         int;
begin
  -- Fresh demo state
  delete from public.picks;
  delete from public.participants;

  -- Upsert 24 scored golfers (rank order = draft order). Round values are to-par.
  for demo in
    select * from (values
      ('Scottie Scheffler',        1, 'active', -5,  -4,  -3,  -4),
      ('Si Woo Kim',               2, 'active', -2,  -1,   0,  -3),
      ('Jordan Spieth',            3, 'active', -3,  -2,  -4,  -1),
      ('Keith Mitchell',           4, 'active',  1,   2,  -1,   0),
      ('Brooks Koepka',            5, 'active', -1,  -3,  -2,  -2),
      ('Pierceson Coody',          6, 'active',  2,   1,   3,   2),
      ('Michael Thorbjornsen',     7, 'active',  0,  -1,   1,  -2),
      ('Wyndham Clark',            8, 'active', -2,  -2,  -1,  -1),
      ('Rasmus Hojgaard',          9, 'active',  3,   2,   1,   4),
      ('Davis Thompson',          10, 'active', -1,   0,  -2,  -1),
      ('Ryo Hisatsune',           11, 'cut',  null, null, null, null),
      ('Thorbjorn Olesen',        12, 'active',  1,   1,   0,   2),
      ('Taylor Pendrith',         13, 'active', -4,  -1,  -2,  -3),
      ('Aaron Rai',               14, 'active', -2,  -3,  -1,   0),
      ('Michael Brennan',         15, 'active',  2,   3,   1,   1),
      ('Mac Meissner',            16, 'active',  0,   1,  -1,   0),
      ('Rico Hoey',               17, 'active', -1,  -2,  -2,  -1),
      ('Sungjae Im',              18, 'active', -3,  -2,  -3,  -2),
      ('Haotong Li',              19, 'active',  1,   0,   2,   1),
      ('Stephan Jaeger',          20, 'cut',  null, null, null, null),
      ('Max Greyserman',          21, 'active', -2,  -1,  -1,  -2),
      ('Christiaan Bezuidenhout', 22, 'active',  0,  -1,   0,  -1),
      ('Jordan Smith',            23, 'active',  2,   1,   2,   3),
      ('Tom Kim',                 24, 'active', -1,  -1,  -2,  -1)
    ) as v(name, rank, status, r1, r2, r3, r4)
    order by v.rank
  loop
    select id into gid from public.golfers where name = demo.name limit 1;
    if gid is null then
      insert into public.golfers (name, rank, status, r1, r2, r3, r4)
      values (demo.name, demo.rank, demo.status, demo.r1, demo.r2, demo.r3, demo.r4)
      returning id into gid;
    else
      update public.golfers
        set rank = demo.rank, status = demo.status,
            r1 = demo.r1, r2 = demo.r2, r3 = demo.r3, r4 = demo.r4
        where id = gid;
    end if;
    golfer_ids := array_append(golfer_ids, gid);
  end loop;

  -- 4 guest teams (no login). Link to a profile later to claim "My Team".
  insert into public.participants (display_name, draft_position) values
    ('Augusta Aces',     1),
    ('Birdie Brigade',   2),
    ('Fairway Founders', 3),
    ('Bogey Boys',       4);

  select array_agg(id order by draft_position) into parts from public.participants;

  -- Snake draft: assign the 24 golfers in rank order across the 4 teams.
  for i in 0 .. (n * rounds - 1) loop
    rnd := i / n;
    pos := i % n;
    if rnd % 2 = 0 then idx := pos; else idx := n - 1 - pos; end if;
    insert into public.picks (participant_id, golfer_id, pick_number)
    values (parts[idx + 1], golfer_ids[i + 1], i);
  end loop;

  -- Mark the draft complete.
  update public.draft_state
    set status = 'complete',
        current_pick = n * rounds,
        pick_deadline = null,
        paused_remaining_seconds = null,
        updated_at = now()
    where id = 1;
end $$;

-- Expected standings (best 3 of 6, cut = +16):
--   1) Augusta Aces     -28
--   2) Bogey Boys       -24
--   3) Birdie Brigade   -20
--   4) Fairway Founders -18
