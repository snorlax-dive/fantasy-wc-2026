-- Per-player attacking quality (0.10–0.97), auto-derived from qualifier goals/assists
-- by step=qualifiers in app/api/admin/seed/route.ts.
-- NULL means either step=qualifiers hasn't run yet, OR the position doesn't warrant
-- a per-player signal (GK and DEF always receive NULL by design).
-- Callers fall back to team attack rating when NULL.
alter table players
  add column if not exists personal_attack real;
