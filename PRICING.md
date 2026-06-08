# Player Pricing — Admin Guide

This document covers how players get their initial prices, how those prices are refined using real
qualifier data, and how prices are updated between tournament stages. It is written for the
commissioner — the person running the admin routes.

---

## Overview

Prices are computed from a projection model (`lib/projection.ts`) that estimates how many fantasy
points a player is expected to score per match, then maps that onto a £4.0–£13.5 scale. Three
inputs drive the model:

| Input | Source at seed | Source at reprice |
|-------|---------------|-------------------|
| **Team strength** (attack / defense) | `lib/teamStrength.ts` — hardcoded ratings for all 48 WC 2026 qualifiers | Same |
| **Fixture difficulty** | GROUP: each of the 3 actual opponents' attack ratings; KO: upcoming fixture opponent | Same |
| **Start probability** | Shirt-number heuristic → refined by qualifier minutes (`step=qualifiers`) | Observed WC minutes, then qualifier start_prob, then shirt-number fallback |

---

## Step 1 — Seed base data

```
GET /api/admin/seed?step=base
```

Pulls all 48 teams and every fixture from API-Football into the database. Run once before anything
else. Fixtures are upserted by `api_fixture_id`, so it is safe to rerun.

---

## Step 2 — Seed player list

```
GET /api/admin/seed?step=players&offset=0&limit=8
```

Pulls each team's 26-man squad from API-Football, computes an initial price for every player, and
inserts them into the `players` table.

The initial start probability is estimated from the shirt number: shirt 1 gets the highest signal
(~0.88), shirt 26 the lowest (~0.15), blended 70/30 with a stable per-player hash for within-squad
variation. This is a reasonable prior but it has no empirical backing — **run step=qualifiers
afterward to replace it with real data.**

Batched by team because API-Football enforces rate limits. Run repeatedly, incrementing `offset` by
`limit` each time, until the response contains `"done": true`.

```
# Example sequence for 48 teams with limit=8:
/api/admin/seed?step=players&offset=0&limit=8
/api/admin/seed?step=players&offset=8&limit=8
/api/admin/seed?step=players&offset=16&limit=8
/api/admin/seed?step=players&offset=24&limit=8
/api/admin/seed?step=players&offset=32&limit=8
/api/admin/seed?step=players&offset=40&limit=8
```

Add `&dry=1` to any call to preview what would be fetched without writing anything.

---

## Step 3 — Refine prices with qualifier minutes (recommended)

```
GET /api/admin/seed?step=qualifiers&offset=0&limit=8
```

This step replaces the shirt-number startProb with a value derived from each player's actual
minutes across their recent WC qualifier and national-team competitions. **Run it after
`step=players`.** It updates `players.start_prob`, `players.price`, and `players.expected_points`
in place.

### How start probability is computed

For each national team, the route calls `/players?team={id}&season=2025` on API-Football, which
returns aggregate per-player statistics for the season. The start probability is:

```
startProb = clamp(totalMinutes / (totalAppearances × 90), 0.10, 0.97)
```

A player who started 9 of 10 games and averaged 81 minutes gets `810 / (10 × 90) = 0.90`. A fringe
player with 3 substitute appearances of 20 minutes each gets `60 / (3 × 90) = 0.22`.

Because the API ID used is the **national team** entity (not a club team), the endpoint only returns
national-team competitions — qualifiers, friendlies, Nations League, etc. Club minutes do not bleed
in. All national-team competition types are summed together, since they all reflect the manager's
selection decisions.

### Optional: restrict to specific qualifier leagues

If you only want WC-qualifying competition stats (excluding friendlies), pass the API-Football
league IDs as a comma-separated `leagues` parameter. To find the right IDs, check
[api-football.com/documentation](https://www.api-football.com/documentation-v3) or use the
`/leagues` endpoint filtered by `type=cup&name=World Cup`.

```
# Restrict to CONMEBOL + CONCACAF qualifier leagues (example IDs — verify yours):
/api/admin/seed?step=qualifiers&offset=0&limit=8&leagues=29,30
```

Without the `leagues` parameter, all national-team competitions for the season are included. This
is usually the right default — more sample size, and friendlies still reflect who the manager
trusts.

### Run sequence

Same batching pattern as `step=players`:

```
/api/admin/seed?step=qualifiers&offset=0&limit=8
/api/admin/seed?step=qualifiers&offset=8&limit=8
... until "done": true
```

The `sample` field in each response shows the first 20 players updated that batch — check it to
verify startProbs look sensible (starters around 0.70–0.95, squad depth around 0.15–0.40).

### When NOT to run this step

- If you do not have an API-Football plan that covers player statistics for national teams (free
  tier may not include `/players` for national team entities — verify before running).
- After the tournament has started. Once WC match minutes are available, the reprice route uses
  those directly and the stored `start_prob` becomes secondary. The qualifiers step would
  overwrite WC form data with pre-tournament qualifier data, which is worse. Only reprice and
  score should run during the tournament.

---

## Step 4 — Poll + score results

These run on a cron (or manually) once matches are being played.

```
GET /api/admin/poll   — fetch live/finished match results + player stats from API-Football
GET /api/admin/score  — recompute fantasy points from stored stats, score predictions + squads
```

See `CLAUDE.md` for the full data flow.

---

## Step 5 — Reprice before each knockout re-draft

```
GET /api/admin/reprice?stage=R32
GET /api/admin/reprice?stage=R16
... etc.
```

Before each knockout re-draft window opens, run the reprice route for the upcoming stage. It
blends the pre-tournament projection (prior) with each player's actual in-tournament form via
shrinkage, so prices respond to performance without early small samples whipsawing them.

**Start probability priority during repricing:**

1. **WC match minutes** (strongest signal) — if the player has appeared in WC matches, their
   average minutes per game is used directly.
2. **Stored qualifier start_prob** — if no WC minutes yet (unlikely mid-tournament, but possible
   for debut subs), falls back to the value set by `step=qualifiers`.
3. **Shirt-number hash** — last resort, used only if neither of the above is available.

Add `&dry=1` to preview prices without writing them.

---

## Pricing model summary

The full model and its constants live in `lib/projection.ts`. Key characteristics:

- **Attack scales goal/assist rates** — a France ATK midfielder projects higher than a Haiti
  midfielder, even at the same startProb.
- **Defense scales clean-sheet probability** — `csProb = defense × 0.45 × (1 − 0.35 × opponentAttack)`.
  Morocco's GK vs France is meaningfully cheaper than vs New Zealand.
- **MID sub-types** — shirts 8–11 are treated as attacking mids (higher goal/assist projection);
  all other shirt numbers are treated as defensive/holding mids.
- **Price distribution is bottom-heavy** (`PRICE_SKEW = 1.6`) — many affordable enablers, few
  expensive premiums, matching the FPL-style squad-budget dynamic.
- **Defensive actions and GK saves are excluded from the projection prior** — these components
  are too volatile to project reliably. They are rewarded in actual scoring (tackles +1/4 combined
  capped +2; saves +1 per 3) but not priced in, acting as upside surprises.

---

## Scoring rules reference

| Event | Points |
|-------|--------|
| Playing 1–59 min | +1 |
| Playing 60+ min | +2 |
| Goal — GK or DEF | +6 |
| Goal — MID | +5 |
| Goal — FWD | +4 |
| Assist | +3 |
| Clean sheet — GK or DEF (60+ min) | +4 |
| Clean sheet — MID (60+ min) | +1 |
| GK saves (per 3) | +1 |
| Penalty saved | +5 |
| Tackles + interceptions (per 4, max +2) | +1 / +2 |
| Yellow card | −1 |
| Red card | −3 |
| Penalty missed | −2 |
| Own goal | −2 |
