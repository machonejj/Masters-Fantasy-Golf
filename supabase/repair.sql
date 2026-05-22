-- ============================================================================
--  Masters Fantasy Golf — REPAIR SCRIPT
--  Run this if:
--  - draft_state table exists but id=1 row is missing
--  - Golfers table is empty
--
--  Instructions:
--  1. Go to Supabase Dashboard → SQL Editor
--  2. Click "New query"
--  3. Copy and paste this entire file
--  4. Click "Run"
-- ============================================================================

-- Ensure draft_state row exists with defaults
INSERT INTO public.draft_state (id) 
VALUES (1) 
ON CONFLICT (id) DO UPDATE SET updated_at = NOW();

-- Clear existing test data (safe to re-run)
DELETE FROM public.picks;
DELETE FROM public.participants;

-- Seed demo golfers (24 golfers with scores)
-- UPSERT by name so it overlays cleanly each time
INSERT INTO public.golfers (name, rank, odds, status, r1, r2, r3, r4) VALUES
('Scottie Scheffler',1,'+134','active',-5,-4,-3,-4),
('Si Woo Kim',2,'+1075','active',-2,-1,0,-3),
('Jordan Spieth',3,'+1650','active',-3,-2,-4,-1),
('Keith Mitchell',4,'+2500','active',1,2,-1,0),
('Brooks Koepka',5,'+2700','active',-1,-3,-2,-2),
('Pierceson Coody',6,'+3100','active',2,1,3,2),
('Michael Thorbjornsen',7,'+3300','active',0,-1,1,-2),
('Wyndham Clark',8,'+3700','active',-2,-2,-1,-1),
('Rasmus Hojgaard',9,'+3700','active',3,2,1,4),
('Davis Thompson',10,'+3900','active',-1,0,-2,-1),
('Ryo Hisatsune',11,'+3900','cut',NULL,NULL,NULL,NULL),
('Thorbjorn Olesen',12,'+4700','active',1,1,0,2),
('Taylor Pendrith',13,'+4700','active',-4,-1,-2,-3),
('Aaron Rai',14,'+4700','active',-2,-3,-1,0),
('Michael Brennan',15,'+5100','active',2,3,1,1),
('Mac Meissner',16,'+5200','active',0,1,-1,0),
('Rico Hoey',17,'+5200','active',4,3,2,3),
('Sungjae Im',18,'+5300','active',-1,0,1,-2),
('Haotong Li',19,'+5500','active',1,2,0,1),
('Stephan Jaeger',20,'+5500','active',-2,-1,-3,-1),
('Max Greyserman',21,'+5700','active',3,2,4,3),
('Christiaan Bezuidenhout',22,'+5700','active',0,-1,1,0),
('Jordan Smith',23,'+6100','active',-1,0,1,2),
('Tom Kim',24,'+6300','active',2,3,2,1)
ON CONFLICT DO NOTHING;

-- Create 4 demo teams with draft positions 1-4
INSERT INTO public.participants (id, display_name, draft_position, created_at)
VALUES
(gen_random_uuid(), 'Team Alpha', 1, NOW()),
(gen_random_uuid(), 'Team Bravo', 2, NOW()),
(gen_random_uuid(), 'Team Charlie', 3, NOW()),
(gen_random_uuid(), 'Team Delta', 4, NOW())
ON CONFLICT DO NOTHING;

-- Create demo draft (snake: 1,2,3,4 → 4,3,2,1 → 1,2,3,4 → 4,3,2,1)
WITH participants_ordered AS (
  SELECT id, draft_position FROM public.participants ORDER BY draft_position
),
golfers_ordered AS (
  SELECT id, rank FROM public.golfers WHERE status = 'active' ORDER BY rank
)
INSERT INTO public.picks (participant_id, golfer_id, pick_number)
SELECT
  (ARRAY(SELECT id FROM participants_ordered))[
    CASE 
      WHEN (ROW_NUMBER() OVER (ORDER BY rn) - 1) % 8 < 4 
      THEN ((ROW_NUMBER() OVER (ORDER BY rn) - 1) % 4) + 1
      ELSE 5 - (((ROW_NUMBER() OVER (ORDER BY rn) - 1) % 4) + 1)
    END
  ],
  gid,
  ROW_NUMBER() OVER (ORDER BY rn)
FROM (
  SELECT id as gid, ROW_NUMBER() OVER (ORDER BY rank) as rn FROM golfers_ordered LIMIT 24
)
ON CONFLICT DO NOTHING;

-- Verify the setup
SELECT 'draft_state' as table_name, COUNT(*) as row_count FROM public.draft_state
UNION ALL
SELECT 'golfers', COUNT(*) FROM public.golfers WHERE status != 'wd'
UNION ALL
SELECT 'participants', COUNT(*) FROM public.participants
UNION ALL
SELECT 'picks', COUNT(*) FROM public.picks;
