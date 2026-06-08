-- Projected points for the upcoming stage, computed by lib/projection.ts and
-- (re)written on every seed/reprice run — drives pricing and is surfaced to
-- managers in the player explorer alongside price/ownership/realized points.
alter table players add column if not exists expected_points numeric(5,2);
