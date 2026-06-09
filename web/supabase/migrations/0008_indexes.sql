-- Missing indexes on FK columns that appear in WHERE / JOIN clauses across the app.
-- The initial schema only had 3 indexes; full-table scans on these tables will
-- hurt once we have 48+ fixtures × 15+ users × 736 players.

create index if not exists idx_predictions_user_id     on predictions(user_id);
create index if not exists idx_predictions_fixture_id  on predictions(fixture_id);

create index if not exists idx_squads_user_id          on squads(user_id);
create index if not exists idx_squads_stage            on squads(stage);

create index if not exists idx_squad_players_squad_id  on squad_players(squad_id);
create index if not exists idx_squad_players_player_id on squad_players(player_id);

create index if not exists idx_pms_player_id           on player_match_stats(player_id);
create index if not exists idx_pms_fixture_id          on player_match_stats(fixture_id);

create index if not exists idx_bracket_picks_user_id   on bracket_picks(user_id);

create index if not exists idx_blocks_blocker          on blocks(blocker);
create index if not exists idx_blocks_target_stage     on blocks(target, stage);

create index if not exists idx_shield_uses_user_id     on shield_uses(user_id);
create index if not exists idx_chip_uses_user_id       on chip_uses(user_id);
