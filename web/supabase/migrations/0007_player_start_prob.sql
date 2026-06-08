-- Stores the observed start probability derived from WC qualifier minutes data.
-- NULL = not yet computed; callers fall back to the shirt-number heuristic.
alter table players
  add column if not exists start_prob real;
