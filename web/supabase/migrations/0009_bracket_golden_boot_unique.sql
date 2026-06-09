-- The existing unique(user_id, pick_type, team_id) constraint doesn't prevent
-- duplicate GOLDEN_BOOT rows because both have team_id = NULL and NULL != NULL
-- in Postgres UNIQUE constraints. A partial unique index covering the NULL-team_id
-- case (i.e. player-based picks like GOLDEN_BOOT) closes this gap.
create unique index if not exists bracket_picks_null_team_unique
  on bracket_picks(user_id, pick_type)
  where team_id is null;
