-- Per-player attacking quality (0.10–0.97), auto-derived from qualifier goals/assists
-- by step=qualifiers in app/api/admin/seed/route.ts.
-- NULL = not yet computed; callers fall back to team attack rating.
alter table players
  add column if not exists personal_attack real;
