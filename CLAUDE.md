# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A private fantasy-league app for ~15-20 friends covering World Cup 2026 (Jun 11 - Jul 19, 2026): match
predictions, a fantasy squad game, PvP "blocks/shields", and a knockout bracket. See `PLAN.md` for the
full design rationale (scoring rules, sprint plan, locked decisions) and `SETUP.md` for how the
commissioner provisions Supabase/Vercel/API-Football. `sim.py` + `wc2022.json` are the original Python
scoring-rules prototype/simulation (validated against 2022 WC data) that `lib/scoring.ts` was ported from
— treat `sim.py` as the reference spec when in doubt about a scoring rule, but the TS module is the
source of truth for the running app.

The actual app lives in **`web/`** — a Next.js 16 (App Router) project. Always run commands from `web/`
(or with `--prefix web` from the repo root).

## Commands

All from `web/`:
- `npm run dev` — start the dev server (Turbopack, localhost:3000)
- `npm run build` — production build
- `npm run lint` — ESLint (flat config, `eslint-config-next` core-web-vitals + typescript)

There is no test suite/runner configured in this repo.

## Important: this is Next.js 16, not the Next.js you may know

Next.js 16 has breaking changes vs. earlier versions (APIs, conventions, file layout may differ from
training data). Notably:
- `middleware.ts` was renamed to **`proxy.ts`** (exporting `proxy()`, Node.js runtime) — see `web/proxy.ts`.
- `cookies()` from `next/headers` is **async** and must be awaited (see `lib/supabase/server.ts`).
- Before writing Next.js code, check `node_modules/next/dist/docs/` for the current API rather than
  assuming prior-version behavior.

## Architecture

### Data flow / source of truth
Supabase Postgres is the single source of truth. The app reads/writes it directly (via `@supabase/ssr`
server/browser clients) and Row Level Security (RLS) is the real authorization boundary — not just UI
checks. A separate ingestion path pulls from API-Football and writes results back:

```
API-Football  →  /api/admin/{seed,poll,score}  →  Supabase Postgres (RLS)  →  Next.js pages/actions
 (fixtures,       (cron-secret or commissioner       fixtures, players,        predictions/squad/
  events,          authorized route handlers,        predictions, squads,      bracket/blocks UI,
  injuries)        using the service-role            blocks, scores...         leaderboard
                   admin client)
```

- `lib/apiFootball.ts` — thin fetch wrapper around API-Football (API-Sports v3), handles RapidAPI vs
  direct-host auth headers and surfaces API-level errors.
- `app/api/admin/seed/route.ts` — pulls teams/fixtures/players/prices from API-Football into Postgres.
- `app/api/admin/poll/route.ts` — polls live/finished fixtures, upserts results + per-player match stats.
- `app/api/admin/score/route.ts` — recomputes prediction/fantasy/bracket points from stored stats using
  the pure functions in `lib/scoring.ts`, then upserts `points`/`fantasy_points` back onto rows that the
  `get_leaderboard()` Postgres function (in the migration) sums per user.
- `app/api/admin/notify/route.ts` — sends lock-reminder / reveal emails via `lib/email.ts` (nodemailer/SMTP).

All three `/api/admin/*` route handlers share the same `authorized()` pattern: accept either
`Authorization: Bearer $CRON_SECRET` (for cron/GitHub Actions polling) **or** an authenticated user whose
`profiles.is_commissioner` is true. Follow this pattern for any new privileged route.

### Scoring engine (`lib/scoring.ts`)
Pure, side-effect-free functions only — `playerFantasyPoints()`, `scorePrediction()`, plus the
`BRACKET_POINTS` table and differential-bonus constants. This is the canonical rules implementation
(ported from and validated against `sim.py`/`wc2022.json`); any rule change should land here first and
be reflected back into `sim.py` if you re-run simulations. Keep I/O out of this module so it stays easy
to test/validate against the 2022 reference data.

### Database (`web/supabase/migrations/`)
Hand-written, sequential SQL migrations (`0001_initial_schema.sql` is the big one: tables, enums, RLS
policies, triggers, the `get_leaderboard()` and `is_commissioner()` SQL functions; later files are small
deltas). They're run manually in the Supabase SQL editor — there's no migration-runner wired up in this
repo. When changing schema, add a new numbered migration file rather than editing old ones.

Core tables: `profiles`, `teams`, `players`, `fixtures`, `player_match_stats`, `predictions`, `squads`/
`squad_players`, `bracket_picks`, `blocks`/`shield_uses`, `settings`. Stage progression is modeled via
the `stage_bucket` enum (`GROUP, R32, R16, QF, SF, FINAL`) used across squads, blocks, and bracket picks
to drive the "re-draft every knockout round" mechanic.

**Locking rule:** every per-round/per-match user action (`predictions`, `squads`, `blocks`, ...) is only
editable until the relevant `kickoff`/`lock_time`. This must be enforced both in the DB (RLS / checks)
and in server actions — see `app/predictions/actions.ts` for the canonical
`if (new Date(fixture.lock_time) <= new Date()) return { error: ... }` pattern. Don't rely on the UI
alone to hide actions after lock.

### Supabase client layers (`lib/supabase/`)
Three distinct clients — pick the right one:
- `client.ts` — browser client (anon key), for Client Components.
- `server.ts` — server client (anon key, cookie-bound session), for Server Components/Actions/Route
  Handlers. `cookies()` is async in Next 16; the `setAll` is wrapped in try/catch because Server
  Components can't write cookies (the `proxy.ts` session refresh handles that).
- `admin.ts` — service-role client that **bypasses RLS**. Only use it in trusted server code (seed/poll/
  score routes, admin actions). Never import it into a Client Component.
- `proxy-session.ts` — used by `proxy.ts` (Next 16's renamed `middleware.ts`) to refresh the auth
  session cookie on every request.
- `fetchAll.ts` — pagination helper for exhausting Supabase's default row-limit on large reads.

### Auth
Supabase magic-link auth gated by a shared `INVITE_CODE` (see `app/login/`). `profiles.is_commissioner`
is the privilege flag checked everywhere admin/commissioner-only behavior is gated (UI redirects in
`app/admin/**`, and the `authorized()` checks in `/api/admin/*` route handlers). A new user gets a
`profiles` row auto-created via the `handle_new_user()` trigger on `auth.users` insert.

### App structure
Standard Next.js App Router: each top-level feature is a route segment under `app/` (e.g. `predictions/`,
`squad/`, `blocks/`, `bracket/`, `leaderboard/`, `players/`, `season/`, `recap/`, `live/`, `match/[id]/`,
`admin/**`). The common pattern per feature is `page.tsx` (server component: auth + data fetch) +
`actions.ts` (server actions, mutate via the server/admin Supabase client, enforce lock-time and
ownership) + an interactive client component (e.g. `squad-builder.tsx`, `predictions-board.tsx`,
`blocks-board.tsx`, `bracket-board.tsx`).

### Environment variables
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`NEXT_PUBLIC_SITE_URL`, `INVITE_CODE`, `CRON_SECRET`, `API_FOOTBALL_KEY` (+ optional
`API_FOOTBALL_HOST` for RapidAPI), `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`/`SMTP_FROM`. All
`.env*` files are gitignored — there is no committed `.env.example`; cross-reference `SETUP.md` §6 for
which values are required for local dev.
