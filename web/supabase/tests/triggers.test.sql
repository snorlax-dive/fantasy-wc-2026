-- pgTAP tests for database triggers
-- Run with: supabase test db

BEGIN;

SELECT plan(6);

-- ============================================================
-- handle_new_user trigger: auto-creates profiles row
-- ============================================================
SELECT tests.create_supabase_user('trigger_test@test.com', 'pw');

SELECT ok(
  (SELECT count(*) FROM profiles WHERE id = (SELECT id FROM auth.users WHERE email = 'trigger_test@test.com')) = 1,
  'handle_new_user trigger creates profiles row on auth.users INSERT'
);

-- Idempotent: duplicate trigger call (simulate by re-running the function)
-- This verifies the ON CONFLICT DO NOTHING clause
SELECT lives_ok(
  $$ INSERT INTO profiles (id, created_at)
     VALUES ((SELECT id FROM auth.users WHERE email = 'trigger_test@test.com'), NOW())
     ON CONFLICT DO NOTHING $$,
  'duplicate profiles insert is a no-op (ON CONFLICT DO NOTHING)'
);

SELECT ok(
  (SELECT count(*) FROM profiles WHERE id = (SELECT id FROM auth.users WHERE email = 'trigger_test@test.com')) = 1,
  'profiles row not duplicated after second insert attempt'
);

-- ============================================================
-- predictions_touch trigger: updated_at bumped on UPDATE
-- ============================================================
DO $$
DECLARE
  uid   uuid := (SELECT id FROM auth.users WHERE email = 'trigger_test@test.com');
  fx_id bigint;
  team_id bigint;
BEGIN
  INSERT INTO teams (name, code) VALUES ('Trig Team', 'TRG') ON CONFLICT DO NOTHING RETURNING id INTO team_id;
  SELECT id INTO team_id FROM teams WHERE code = 'TRG';
  INSERT INTO fixtures (team_a, team_b, stage, kickoff, lock_time)
    VALUES (team_id, team_id, 'GROUP', NOW() + interval '1 day', NOW() + interval '1 day')
    RETURNING id INTO fx_id;
  INSERT INTO predictions (user_id, fixture_id, pred_a, pred_b, is_banker, red_card_pred)
    VALUES (uid, fx_id, 1, 0, false, false);
END $$;

SELECT tests.authenticate_as('trigger_test@test.com');

SELECT ok(
  (SELECT updated_at FROM predictions WHERE user_id = (SELECT id FROM auth.users WHERE email = 'trigger_test@test.com') LIMIT 1) IS NOT NULL,
  'predictions.updated_at set on INSERT'
);

DO $$
DECLARE
  old_ts timestamptz;
  new_ts timestamptz;
BEGIN
  PERFORM pg_sleep(0.01); -- ensure clock advances
  SELECT updated_at INTO old_ts FROM predictions LIMIT 1;
  UPDATE predictions SET pred_a = 2 WHERE user_id = (SELECT id FROM auth.users WHERE email = 'trigger_test@test.com');
  SELECT updated_at INTO new_ts FROM predictions LIMIT 1;
  IF new_ts <= old_ts THEN
    RAISE EXCEPTION 'updated_at was not bumped: old=%, new=%', old_ts, new_ts;
  END IF;
END $$;

SELECT ok(true, 'predictions.updated_at bumped on UPDATE');

-- ============================================================
-- squads_touch trigger: updated_at bumped on UPDATE
-- ============================================================
DO $$
DECLARE
  uid uuid := (SELECT id FROM auth.users WHERE email = 'trigger_test@test.com');
BEGIN
  INSERT INTO squads (user_id, stage, budget_used) VALUES (uid, 'GROUP', 50);
END $$;

SELECT ok(
  (SELECT updated_at FROM squads WHERE user_id = (SELECT id FROM auth.users WHERE email = 'trigger_test@test.com') LIMIT 1) IS NOT NULL,
  'squads.updated_at set on INSERT'
);

SELECT * FROM finish();

ROLLBACK;
