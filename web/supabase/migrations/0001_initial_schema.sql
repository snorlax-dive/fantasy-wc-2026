-- =====================================================================
-- Fantasy World Cup 2026 — initial schema
-- Run ONCE in the Supabase SQL Editor (or via the Supabase CLI).
-- Safe assumptions: fresh project, Postgres 17, Supabase auth enabled.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Enums ----------
create type player_position   as enum ('GK','DEF','MID','FWD');
create type stage_bucket      as enum ('GROUP','R32','R16','QF','SF','FINAL');
create type bracket_pick_type as enum ('REACH_R16','REACH_QF','REACH_SF','REACH_FINAL','CHAMPION','GOLDEN_BOOT');
create type fixture_status    as enum ('SCHEDULED','LIVE','FINISHED');

-- ---------- Core / reference tables ----------
create table profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  display_name    text not null default 'Manager',
  avatar_url      text,
  is_commissioner boolean not null default false,
  created_at      timestamptz not null default now()
);

create table settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

create table teams (
  id               serial primary key,
  code             text unique,
  name             text not null,
  group_letter     text,
  api_team_id      integer unique,
  flag_url         text,
  eliminated_after stage_bucket
);

create table players (
  id            serial primary key,
  team_id       integer not null references teams(id) on delete cascade,
  name          text not null,
  position      player_position not null,
  price         numeric(4,1) not null default 5.0,
  api_player_id integer unique,
  photo_url     text,
  active        boolean not null default true
);
create index players_team_idx on players(team_id);

create table fixtures (
  id             serial primary key,
  api_fixture_id integer unique,
  round          text not null,
  stage          stage_bucket not null,
  kickoff        timestamptz not null,
  lock_time      timestamptz not null,
  team_a         integer references teams(id),
  team_b         integer references teams(id),
  status         fixture_status not null default 'SCHEDULED',
  score_a        integer,
  score_b        integer,
  had_red_card   boolean not null default false,
  finished       boolean not null default false
);
create index fixtures_stage_idx on fixtures(stage);
create index fixtures_kickoff_idx on fixtures(kickoff);

-- Per-player per-match outcomes; drives fantasy scoring + scorer/red predictions.
create table player_match_stats (
  fixture_id     integer not null references fixtures(id) on delete cascade,
  player_id      integer not null references players(id) on delete cascade,
  minutes        integer not null default 0,
  goals          integer not null default 0,
  own_goals      integer not null default 0,
  red_card       boolean not null default false,
  pens_saved     integer not null default 0,
  pens_missed    integer not null default 0,
  clean_sheet    boolean not null default false,
  fantasy_points integer not null default 0,
  primary key (fixture_id, player_id)
);

-- ---------- Per-user game tables ----------
create table predictions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,
  fixture_id    integer not null references fixtures(id) on delete cascade,
  pred_a        integer,
  pred_b        integer,
  scorer1       integer references players(id),
  scorer2       integer references players(id),
  red_card_pred boolean,
  is_banker     boolean not null default false,
  points        integer,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, fixture_id)
);

create table squads (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references profiles(id) on delete cascade,
  stage          stage_bucket not null,
  budget_used    numeric(5,1) not null default 0,
  fantasy_points integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (user_id, stage)
);

create table squad_players (
  squad_id   uuid not null references squads(id) on delete cascade,
  player_id  integer not null references players(id),
  is_captain boolean not null default false,
  is_vice    boolean not null default false,
  primary key (squad_id, player_id)
);

create table bracket_picks (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references profiles(id) on delete cascade,
  pick_type bracket_pick_type not null,
  team_id   integer references teams(id),
  player_id integer references players(id),
  points    integer not null default 0,
  unique (user_id, pick_type, team_id)
);

create table blocks (
  id           uuid primary key default gen_random_uuid(),
  stage        stage_bucket not null,
  blocker      uuid not null references profiles(id) on delete cascade,
  target       uuid not null references profiles(id) on delete cascade,
  player_id    integer not null references players(id),
  committed_at timestamptz not null default now(),
  revealed     boolean not null default false,
  unique (blocker, stage)
);

create table shield_uses (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  stage      stage_bucket not null,
  created_at timestamptz not null default now(),
  unique (user_id, stage)
);

-- ---------- Functions & triggers ----------
-- Auto-create a profile row when a new auth user signs up.
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create trigger predictions_touch before update on predictions for each row execute function touch_updated_at();
create trigger squads_touch      before update on squads      for each row execute function touch_updated_at();

-- True if the current user is the commissioner (used by RLS policies).
create or replace function is_commissioner()
returns boolean language sql security definer stable set search_path = public as $$
  select coalesce((select is_commissioner from public.profiles where id = auth.uid()), false);
$$;

-- Shared leaderboard: SECURITY DEFINER so it can total every user's points
-- (RLS otherwise restricts pick rows to their owner).
create or replace function get_leaderboard()
returns table (
  user_id           uuid,
  display_name      text,
  prediction_points bigint,
  fantasy_points    bigint,
  bracket_points    bigint,
  total_points      bigint
) language sql security definer stable set search_path = public as $$
  select
    p.id,
    p.display_name,
    coalesce((select sum(points)         from predictions   where user_id = p.id), 0),
    coalesce((select sum(fantasy_points) from squads        where user_id = p.id), 0),
    coalesce((select sum(points)         from bracket_picks where user_id = p.id), 0),
      coalesce((select sum(points)         from predictions   where user_id = p.id), 0)
    + coalesce((select sum(fantasy_points) from squads        where user_id = p.id), 0)
    + coalesce((select sum(points)         from bracket_picks where user_id = p.id), 0)
  from profiles p
  order by 6 desc;
$$;

-- ---------- Row Level Security ----------
alter table profiles           enable row level security;
alter table settings           enable row level security;
alter table teams              enable row level security;
alter table players            enable row level security;
alter table fixtures           enable row level security;
alter table player_match_stats enable row level security;
alter table predictions        enable row level security;
alter table squads             enable row level security;
alter table squad_players      enable row level security;
alter table bracket_picks      enable row level security;
alter table blocks             enable row level security;
alter table shield_uses        enable row level security;

-- profiles
create policy profiles_read   on profiles for select to authenticated using (true);
create policy profiles_update on profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- settings (read all, write commissioner)
create policy settings_read  on settings for select to authenticated using (true);
create policy settings_write on settings for all    to authenticated using (is_commissioner()) with check (is_commissioner());

-- reference tables (read all, write commissioner)
create policy teams_read   on teams   for select to authenticated using (true);
create policy teams_write  on teams   for all    to authenticated using (is_commissioner()) with check (is_commissioner());
create policy players_read on players for select to authenticated using (true);
create policy players_write on players for all   to authenticated using (is_commissioner()) with check (is_commissioner());
create policy fixtures_read on fixtures for select to authenticated using (true);
create policy fixtures_write on fixtures for all  to authenticated using (is_commissioner()) with check (is_commissioner());
create policy pms_read  on player_match_stats for select to authenticated using (true);
create policy pms_write on player_match_stats for all   to authenticated using (is_commissioner()) with check (is_commissioner());

-- predictions (own rows; commissioner can read all)
create policy pred_read   on predictions for select to authenticated using (user_id = auth.uid() or is_commissioner());
create policy pred_insert on predictions for insert to authenticated with check (user_id = auth.uid());
create policy pred_update on predictions for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy pred_delete on predictions for delete to authenticated using (user_id = auth.uid());

-- squads
create policy squad_read   on squads for select to authenticated using (user_id = auth.uid() or is_commissioner());
create policy squad_mutate on squads for all    to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy sp_read on squad_players for select to authenticated
  using (exists (select 1 from squads s where s.id = squad_id and (s.user_id = auth.uid() or is_commissioner())));
create policy sp_mutate on squad_players for all to authenticated
  using (exists (select 1 from squads s where s.id = squad_id and s.user_id = auth.uid()))
  with check (exists (select 1 from squads s where s.id = squad_id and s.user_id = auth.uid()));

-- bracket
create policy bracket_read   on bracket_picks for select to authenticated using (user_id = auth.uid() or is_commissioner());
create policy bracket_mutate on bracket_picks for all    to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- blocks (you see your own always; everyone sees revealed blocks)
create policy blocks_read   on blocks for select to authenticated using (blocker = auth.uid() or revealed or is_commissioner());
create policy blocks_insert on blocks for insert to authenticated with check (blocker = auth.uid());
create policy blocks_update on blocks for update to authenticated using (blocker = auth.uid() and not revealed) with check (blocker = auth.uid());
create policy blocks_delete on blocks for delete to authenticated using (blocker = auth.uid() and not revealed);

-- shields
create policy shield_read   on shield_uses for select to authenticated using (user_id = auth.uid() or is_commissioner());
create policy shield_mutate on shield_uses for all    to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- Grants (RLS still governs row access) ----------
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
grant usage, select on all sequences in schema public to authenticated;
grant execute on function get_leaderboard() to authenticated;

-- ---------- Seed config (commissioner-tunable) ----------
insert into settings (key, value) values
  ('budget_cap',             '100'),
  ('squad_size',             '11'),
  ('formation',              '{"GK":1,"DEF":4,"MID":3,"FWD":3}'),
  ('captain_multiplier',     '2'),
  ('differential_threshold', '0.20'),
  ('block_per_target_cap',   '2'),
  ('shields_per_user',       '2'),
  ('current_stage',          '"GROUP"'),
  ('tournament_locked',      'false')
on conflict (key) do nothing;
