-- =====================================================================
-- Fantasy World Cup 2026 — migration 0002: manager identity + chips
-- Run ONCE in the Supabase SQL Editor (after 0001).
-- =====================================================================

-- Manager identity (club name, crest emoji, colour)
alter table profiles add column if not exists team_name text;
alter table profiles add column if not exists crest text;
alter table profiles add column if not exists color text;

-- Chips — each usable once per tournament (e.g. TRIPLE_CAPTAIN)
create table if not exists chip_uses (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  chip       text not null,
  stage      stage_bucket not null,
  created_at timestamptz not null default now(),
  unique (user_id, chip)
);

alter table chip_uses enable row level security;
create policy chip_read   on chip_uses for select to authenticated using (user_id = auth.uid() or is_commissioner());
create policy chip_mutate on chip_uses for all    to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update, delete on chip_uses to authenticated;
