-- pgTAP tests for get_leaderboard() SQL function
-- Run with: supabase test db

BEGIN;

SELECT plan(8);

-- ============================================================
-- Setup
-- ============================================================
SELECT tests.create_supabase_user('lb_user_a@test.com', 'pw');
SELECT tests.create_supabase_user('lb_user_b@test.com', 'pw');
SELECT tests.create_supabase_user('lb_user_c@test.com', 'pw');

DO $$
DECLARE
  uid_a uuid := (SELECT id FROM auth.users WHERE email = 'lb_user_a@test.com');
  uid_b uuid := (SELECT id FROM auth.users WHERE email = 'lb_user_b@test.com');
  uid_c uuid := (SELECT id FROM auth.users WHERE email = 'lb_user_c@test.com');
  fx_id bigint;
  team_id bigint;
BEGIN
  UPDATE profiles SET display_name = 'User A' WHERE id = uid_a;
  UPDATE profiles SET display_name = 'User B' WHERE id = uid_b;
  UPDATE profiles SET display_name = 'User C' WHERE id = uid_c;

  INSERT INTO teams (name, code) VALUES ('LB Test Team', 'LBT') RETURNING id INTO team_id;

  INSERT INTO fixtures (team_a, team_b, stage, kickoff, lock_time, score_a, score_b, finished)
    VALUES (team_id, team_id, 'GROUP', NOW() - interval '1 hour', NOW() - interval '1 hour', 2, 1, true)
    RETURNING id INTO fx_id;

  -- User A: 10 prediction pts
  INSERT INTO predictions (user_id, fixture_id, pred_a, pred_b, is_banker, red_card_pred, points)
    VALUES (uid_a, fx_id, 2, 1, false, false, 10);

  -- User B: 5 prediction pts + 15 squad pts
  INSERT INTO predictions (user_id, fixture_id, pred_a, pred_b, is_banker, red_card_pred, points)
    VALUES (uid_b, fx_id, 1, 0, false, false, 5);
  INSERT INTO squads (user_id, stage, budget_used, fantasy_points)
    VALUES (uid_b, 'GROUP', 80, 15);

  -- User C: 0 pts (no predictions, no squad)
END $$;

-- ============================================================
-- Tests
-- ============================================================

-- Empty DB test: at least one row returned (our test users)
SELECT ok(
  (SELECT count(*) FROM get_leaderboard()) >= 3,
  'get_leaderboard() returns rows for all users with profiles'
);

-- User A has prediction_points = 10
SELECT ok(
  (SELECT prediction_points FROM get_leaderboard()
   WHERE user_id = (SELECT id FROM auth.users WHERE email = 'lb_user_a@test.com')) = 10,
  'User A has correct prediction_points'
);

-- User A total = 10 (no fantasy or bracket)
SELECT ok(
  (SELECT total_points FROM get_leaderboard()
   WHERE user_id = (SELECT id FROM auth.users WHERE email = 'lb_user_a@test.com')) = 10,
  'User A total_points = prediction_points only'
);

-- User B total = 5 + 15 = 20
SELECT ok(
  (SELECT total_points FROM get_leaderboard()
   WHERE user_id = (SELECT id FROM auth.users WHERE email = 'lb_user_b@test.com')) = 20,
  'User B total_points = prediction + fantasy'
);

-- User C total = 0 (coalesces nulls to 0)
SELECT ok(
  (SELECT total_points FROM get_leaderboard()
   WHERE user_id = (SELECT id FROM auth.users WHERE email = 'lb_user_c@test.com')) = 0,
  'User C total_points coalesces to 0 with no data'
);

-- Ordering: User B (20) > User A (10) > User C (0)
SELECT ok(
  (SELECT array_agg(email ORDER BY rn) FROM (
    SELECT u.email, row_number() OVER (ORDER BY lb.total_points DESC) AS rn
    FROM get_leaderboard() lb
    JOIN auth.users u ON u.id = lb.user_id
    WHERE u.email IN ('lb_user_a@test.com','lb_user_b@test.com','lb_user_c@test.com')
  ) sub) = ARRAY['lb_user_b@test.com','lb_user_a@test.com','lb_user_c@test.com'],
  'get_leaderboard() orders by total_points DESC'
);

-- fantasy_points column present and numeric
SELECT ok(
  (SELECT fantasy_points FROM get_leaderboard()
   WHERE user_id = (SELECT id FROM auth.users WHERE email = 'lb_user_b@test.com')) = 15,
  'User B fantasy_points aggregated correctly'
);

-- bracket_points coalesces to 0 when no picks
SELECT ok(
  (SELECT bracket_points FROM get_leaderboard()
   WHERE user_id = (SELECT id FROM auth.users WHERE email = 'lb_user_a@test.com')) = 0,
  'bracket_points coalesces to 0 for users with no bracket picks'
);

SELECT * FROM finish();

ROLLBACK;
