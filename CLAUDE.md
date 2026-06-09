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

**Testing (Vitest + Playwright):**
- `npm run test` — run all Vitest unit/integration tests (in `web/__tests__/`)
- `npm run test:watch` — watch mode
- `npm run test:coverage` — coverage report
- `npm run test:e2e` — Playwright E2E tests (requires dev server)
- Run a single test file: `npx vitest run __tests__/lib/scoring.test.ts`

**Testing requirements:** When implementing any new feature or fixing any bug, write corresponding tests in `web/__tests__/` before reporting the task complete. Follow the existing patterns:
- Pure library functions (`lib/`) → unit tests in `__tests__/lib/`, no mocks needed
- Server actions (`app/*/actions.ts`) → integration tests in `__tests__/actions/` mocking Supabase clients
- API route handlers (`app/api/`) → integration tests in `__tests__/api/` mocking Supabase + external APIs
- Mock helper: `__tests__/helpers/mockSupabase.ts` — use `makeChain()` and `createMockSupabase()`
- `apiFootball` mocks must include the constants: `{ WORLD_CUP_LEAGUE: 1, SEASON: 2026, apiFootball: vi.fn() }`
- Use table-name router pattern (`adminDb.from.mockImplementation(table => makeChain({ data: tableData[table] }))`) for complex API routes with conditional DB call ordering

TypeScript path alias `@/` maps to `web/` (set in `tsconfig.json`). Use it for all internal imports.

## Important: this is Next.js 16, not the Next.js you may know

Next.js 16 has breaking changes vs. earlier versions (APIs, conventions, file layout may differ from
training data). Notably:
- `middleware.ts` was renamed to **`proxy.ts`** (exporting `proxy()`, Node.js runtime) — see `web/proxy.ts`.
- `cookies()` from `next/headers` is **async** and must be awaited (see `lib/supabase/server.ts`).
- Before writing Next.js code, check `node_modules/next/dist/docs/` for the current API rather than
  assuming prior-version behavior.

## Styling

Tailwind CSS v4 (PostCSS). There is **no `tailwind.config.js`** — all theme customisation lives in
`app/globals.css` inside `@theme {}` blocks. Custom design tokens:
- `cro-red` / `cro-red-dark` / `cro-navy` / `cro-blue` — Croatia palette (primary brand colours)
- `pitch` / `pitch-dark` — green pitch background
- `.checker` / `.checker-sm` — red-white Croatian checkerboard CSS utility classes

React 19 is in use alongside Next.js 16; `use client` / `use server` directives behave as documented in
the Next.js 16 docs.

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
  Supports `?step=base|players|qualifiers` — see `PRICING.md` for the full seeding sequence.
- `app/api/admin/poll/route.ts` — polls live/finished fixtures, upserts results + per-player match stats.
- `app/api/admin/score/route.ts` — recomputes prediction/fantasy/bracket points from stored stats using
  the pure functions in `lib/scoring.ts`, then upserts `points`/`fantasy_points` back onto rows that the
  `get_leaderboard()` Postgres function (in the migration) sums per user.
- `app/api/admin/reprice/route.ts` — re-prices players before each knockout re-draft window using
  `lib/projection.ts` (prior blended with in-tournament form via shrinkage). Takes `?stage=R32|R16|QF|SF|FINAL`;
  add `&dry=1` to preview without writing. Run once per stage before the re-draft window opens.
- `app/api/admin/notify/route.ts` — sends lock-reminder / reveal emails via `lib/email.ts` (nodemailer/SMTP).

All `/api/admin/*` route handlers share the same `authorized()` pattern: accept either
`Authorization: Bearer $CRON_SECRET` (for cron/GitHub Actions polling) **or** an authenticated user whose
`profiles.is_commissioner` is true. Follow this pattern for any new privileged route.

### Scoring engine (`lib/scoring.ts`) and pricing model (`lib/projection.ts`)
`lib/scoring.ts` — pure, side-effect-free functions: `playerFantasyPoints()`, `scorePrediction()`, plus
`BRACKET_POINTS` table and differential-bonus constants. Canonical rules implementation (ported from
`sim.py`/`wc2022.json`). Keep I/O out; any rule change lands here first.

`lib/projection.ts` — pure expected-points model that mirrors the component structure of
`playerFantasyPoints()` so prices are literally derived from the rules. Key exports:
- `projectedPointsPerMatch(input)` — prior optionally shrunk toward realized form via empirical-Bayes
  (`w * prior + n * observed / (w + n)`, default `priorWeight=3`)
- `priceFromExpectedPoints(pos, perMatchPts)` — maps per-match xPts to a £4.0–£13.5 price (power-scaled,
  nearest £0.5, `PRICE_SKEW=1.6` gives a bottom-heavy distribution)
- `lib/teamStrength.ts` — hardcoded attack/defense ratings for all 48 WC 2026 qualifiers, consumed by
  both seed and reprice routes

Defensive actions (tackles, interceptions) and GK saves are intentionally excluded from the pricing
prior — too volatile to project — but are rewarded in actual scoring as upside surprises. See `PRICING.md`
for the full commissioner workflow (seed → qualifiers → poll/score → reprice).

### Database (`web/supabase/migrations/`)
Hand-written, sequential SQL migrations (`0001_initial_schema.sql` is the big one: tables, enums, RLS
policies, triggers, the `get_leaderboard()` and `is_commissioner()` SQL functions; later files are small
deltas). They're run manually in the Supabase SQL editor — there's no migration-runner wired up in this
repo. When changing schema, add a new numbered migration file rather than editing old ones.

Core tables: `profiles`, `teams`, `players`, `fixtures`, `player_match_stats`, `predictions`, `squads`/
`squad_players`, `bracket_picks`, `blocks`/`shield_uses`, `chip_uses`, `settings`. Stage progression is
modeled via the `stage_bucket` enum (`GROUP, R32, R16, QF, SF, FINAL`) used across squads, blocks, and
bracket picks to drive the "re-draft every knockout round" mechanic.

`chip_uses` tracks one-time chips per user per stage: currently only `TRIPLE_CAPTAIN` (captain scores ×3
instead of ×2 for one stage; once used it cannot move to another stage).

`settings` is a key/value store (key `text`, value `jsonb`) that drives runtime tournament state. Key
entries:
- `current_stage` — active `stage_bucket` value; governs squad lock checks and blocks/shields context
- `tournament_locked` — `true` freezes all user mutations globally
- `signups_open` — `true` allows new magic-link registrations
- `budget_cap` — squad budget ceiling in millions (default 100)
- `shields_per_user` — how many shield uses each player gets for the whole tournament (default 2)
- `block_per_target_cap` — max blocks that land on one target per stage (default 2; extras bounce)
- `last_scored_at` — ISO timestamp written by `/api/admin/score` on success (health check)
- `standings_baseline` / `standings_baseline_stage` — leaderboard rank snapshot taken at each stage
  transition to power ▲▼ movement display

`players` has `price`, `expected_points` (per-stage projected total from `lib/projection.ts`), and
`start_prob` (from qualifier minutes; `NULL` = falls back to shirt-number heuristic).

`player_match_stats` tracks: `minutes`, `goals`, `assists`, `own_goals`, `red_card`, `yellow_card`,
`pens_saved`, `pens_missed`, `clean_sheet`, `saves`, `tackles`, `interceptions` — all consumed by
`playerFantasyPoints()` in `lib/scoring.ts`.

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

`components/` holds shared UI:
- `app-chrome.tsx` — the top header + mobile bottom-nav shell that wraps every authenticated page.
  Skips itself on `/login` and `/auth` routes.
- `toast.tsx` / `top-progress.tsx` / `countdown.tsx` — utility UI primitives used across features.

`app/admin/results/` — commissioner-only manual result entry: set match scores, mark finished, and
save per-player stats directly (fallback when API-Football polling is wrong or missing). After saving
results here, run `/api/admin/score` to recompute points.

`app/recap/card/route.tsx` — dynamic OG image route (ImageResponse) for the shareable recap card;
does not render HTML.

`lib/notifyToken.ts` — HMAC-based token helpers for email unsubscribe links (`/api/unsubscribe`).

### Squad formation rules
Squad validation (enforced in `app/squad/actions.ts` and mirrored in the builder UI): exactly 11
players, 1 GK, 3–5 DEF, 2–5 MID, 1–3 FWD. Total price must not exceed `settings.budget_cap`.
Lock check: squads freeze once the first fixture of `current_stage` has kicked off.

### Environment variables
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`NEXT_PUBLIC_SITE_URL`, `INVITE_CODE`, `CRON_SECRET`, `API_FOOTBALL_KEY` (+ optional
`API_FOOTBALL_HOST` for RapidAPI), `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`/`SMTP_FROM`. All
`.env*` files are gitignored — there is no committed `.env.example`; cross-reference `SETUP.md` §6 for
which values are required for local dev.
