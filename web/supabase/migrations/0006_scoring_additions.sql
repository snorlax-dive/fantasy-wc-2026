-- Adds new per-match stat columns to support the richer scoring rules:
-- assists (+3), yellow_card (-1), GK saves (+1/3), tackles+interceptions (+1/3 capped +3).
-- Also note: own_goals already exists but was hardcoded to 0 in the poll route — fixed there.

alter table player_match_stats
  add column if not exists assists       integer not null default 0,
  add column if not exists yellow_card   boolean not null default false,
  add column if not exists saves         integer not null default 0,
  add column if not exists tackles       integer not null default 0,
  add column if not exists interceptions integer not null default 0;
