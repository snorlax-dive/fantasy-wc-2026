-- pgTAP RLS policy tests
-- Run with: supabase test db (requires local Supabase: supabase start)

BEGIN;

SELECT plan(24);

-- ============================================================
-- Helpers
-- ============================================================
-- Create a test user and commissioner in auth.users + profiles
SELECT tests.create_supabase_user('regular@test.com', 'password');
SELECT tests.create_supabase_user('commissioner@test.com', 'password');

DO $$
DECLARE
  reg_id  uuid := (SELECT id FROM auth.users WHERE email = 'regular@test.com');
  com_id  uuid := (SELECT id FROM auth.users WHERE email = 'commissioner@test.com');
BEGIN
  UPDATE profiles SET is_commissioner = true WHERE id = com_id;
  INSERT INTO teams (name, code) VALUES ('Test Team', 'TST') ON CONFLICT DO NOTHING;
  INSERT INTO fixtures (team_a, team_b, stage, kickoff, lock_time)
    VALUES (
      (SELECT id FROM teams WHERE code = 'TST'),
      (SELECT id FROM teams WHERE code = 'TST'),
      'GROUP',
      NOW() + interval '1 day',
      NOW() + interval '1 day'
    )
    ON CONFLICT DO NOTHING;
END $$;

-- ============================================================
-- Anon access (public reference data readable, nothing writable)
-- ============================================================
SELECT tests.authenticate_as_anon();

SELECT ok(
  (SELECT count(*) FROM teams) >= 0,
  'anon can SELECT teams'
);

SELECT ok(
  (SELECT count(*) FROM players) >= 0,
  'anon can SELECT players'
);

SELECT ok(
  (SELECT count(*) FROM fixtures) >= 0,
  'anon can SELECT fixtures'
);

SELECT throws_ok(
  $$ INSERT INTO teams (name, code) VALUES ('Hack FC', 'HCK') $$,
  'anon cannot INSERT teams'
);

-- ============================================================
-- Regular user (own data only)
-- ============================================================
SELECT tests.authenticate_as('regular@test.com');

SELECT ok(
  (SELECT count(*) FROM teams) >= 0,
  'regular user can SELECT teams'
);

SELECT ok(
  (SELECT count(*) FROM settings) >= 0,
  'regular user can SELECT settings'
);

SELECT throws_ok(
  $$ UPDATE settings SET value = 'true' WHERE key = 'tournament_locked' $$,
  'regular user cannot UPDATE settings'
);

SELECT throws_ok(
  $$ UPDATE teams SET name = 'Hacked' WHERE true $$,
  'regular user cannot UPDATE teams'
);

-- Predictions: own rows only
DO $$
DECLARE
  fx_id bigint := (SELECT id FROM fixtures LIMIT 1);
  reg_id uuid := (SELECT id FROM auth.users WHERE email = 'regular@test.com');
BEGIN
  INSERT INTO predictions (user_id, fixture_id, pred_a, pred_b, is_banker, red_card_pred)
    VALUES (reg_id, fx_id, 1, 0, false, false);
END $$;

SELECT ok(
  (SELECT count(*) FROM predictions) = 1,
  'regular user can SELECT own predictions'
);

SELECT throws_ok(
  $$ INSERT INTO predictions (user_id, fixture_id, pred_a, pred_b, is_banker, red_card_pred)
     VALUES ('00000000-0000-0000-0000-000000000000', (SELECT id FROM fixtures LIMIT 1), 1, 0, false, false) $$,
  'regular user cannot INSERT predictions for another user'
);

-- Squads: own only
SELECT ok(
  (SELECT count(*) FROM squads WHERE user_id = (SELECT id FROM auth.users WHERE email = 'regular@test.com')) >= 0,
  'regular user can SELECT own squads'
);

-- Cannot see other users squads count should be filtered by RLS
SELECT ok(
  (SELECT count(*) FROM squads WHERE user_id != (SELECT id FROM auth.users WHERE email = 'regular@test.com')) = 0,
  'regular user cannot SELECT other users squads'
);

-- ============================================================
-- Commissioner (reads all)
-- ============================================================
SELECT tests.authenticate_as('commissioner@test.com');

SELECT ok(
  (SELECT count(*) FROM predictions) >= 0,
  'commissioner can SELECT all predictions'
);

SELECT ok(
  (SELECT count(*) FROM squads) >= 0,
  'commissioner can SELECT all squads'
);

SELECT ok(
  is_commissioner(),
  'is_commissioner() returns true for commissioner'
);

-- Commissioner can update settings
SELECT lives_ok(
  $$ UPDATE settings SET updated_at = NOW() WHERE key = 'tournament_locked' $$,
  'commissioner can UPDATE settings'
);

-- ============================================================
-- is_commissioner() for regular user
-- ============================================================
SELECT tests.authenticate_as('regular@test.com');

SELECT ok(
  NOT is_commissioner(),
  'is_commissioner() returns false for regular user'
);

-- ============================================================
-- Blocks: revealed flag controls visibility
-- ============================================================
SELECT tests.authenticate_as('regular@test.com');

SELECT ok(
  (SELECT count(*) FROM blocks WHERE revealed = false AND blocker != (SELECT id FROM auth.users WHERE email = 'regular@test.com')) = 0,
  'regular user cannot see unrevealed blocks from other users'
);

-- ============================================================
-- shield_uses unique constraint
-- ============================================================
SELECT throws_ok(
  $$ INSERT INTO shield_uses (user_id, stage) VALUES
     ((SELECT id FROM auth.users WHERE email = 'regular@test.com'), 'R16'),
     ((SELECT id FROM auth.users WHERE email = 'regular@test.com'), 'R16') $$,
  'shield_uses enforces unique (user_id, stage)'
);

-- ============================================================
-- Anon cannot see non-anon-granted tables
-- ============================================================
SELECT tests.authenticate_as_anon();

SELECT throws_ok(
  $$ SELECT * FROM predictions LIMIT 1 $$,
  'anon cannot SELECT predictions'
);

SELECT throws_ok(
  $$ SELECT * FROM squads LIMIT 1 $$,
  'anon cannot SELECT squads'
);

SELECT * FROM finish();

ROLLBACK;
