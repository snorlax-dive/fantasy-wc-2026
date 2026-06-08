-- =====================================================================
-- Fantasy World Cup 2026 — migration 0003: tightening
-- Run ONCE in the Supabase SQL Editor (after 0001 + 0002).
-- =====================================================================

-- Store the actual match winner (handles penalty shootouts → correct Champion).
alter table fixtures add column if not exists winner_team integer references teams(id);

-- Leaderboard tiebreaker: total, then fantasy, then bracket.
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
  order by 6 desc, 4 desc, 5 desc;
$$;
grant execute on function get_leaderboard() to authenticated;

-- Sign-ups toggle (commissioner can close new accounts once everyone has joined).
insert into settings (key, value) values ('signups_open', 'true') on conflict (key) do nothing;
