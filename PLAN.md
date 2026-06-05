# Fantasy World Cup 2026 — Build Plan

> Private league, ~15–20 friends. WC 2026 runs **June 11 – July 19, 2026** (48 teams, 104 matches).
> **Plan written 2026-06-02 → ~9 days to kickoff.** This plan is triaged against that deadline.

---

## 1. Locked design decisions (from the brainstorm)

**Three games in one** — predictions is the always-on spine, fantasy is the prestige layer, blocks are the social venom.

1. **Predictions** (everyone, every match)
   - Exact score 5 / correct result + exact margin 3 / correct result wrong margin 2 / wrong 0. *(required field)*
   - Up to 2 anytime goalscorers, +2 each. *(optional)*
   - Red card in match? yes/no → +4 correct "yes", +1 correct "no". *(optional)*
   - One "Banker" match per stage = prediction points doubled.

2. **Fantasy squad** — full open pool + **budget cap (€100)**, 11-a-side (1 GK / 4 DEF / 3 MID / 3 FWD), one captain (×2).
   - Locked per round; only change allowed mid-round is an **injury replacement** (auto-flagged via API injuries endpoint).
   - **Full re-draft after group stage and after every KO round** (5 squad rounds: GROUP, R32, R16, QF, SF, FINAL → note 2026 has a Round of 32).
   - Scoring: appearance(60'+) +2 · goal FWD4/MID5/DEF6/GK6 · clean sheet GK/DEF +4, MID +1 · pen save +5 · pen miss −2 · **red card −3** · own goal −2.
   - **Differential bonus:** own a player <20% owned in the league → +2 per goal he scores.

3. **Blocks & shields** (PvP, starts at the first KO round)
   - **Blind-commit + simultaneous reveal at lock.** Once per manager per round, block one player on one rival → that player scores 0 for that rival that round (captain on a blocked player = also 0).
   - **Per-target cap ~2** blocks/round (extras bounce) so leading isn't suicidal.
   - **2 shields per manager** for the whole tournament; nullifies a block, also revealed at lock (bluffing layer).

4. **Bracket / wall-chart** (locked before kickoff, pays out as it resolves)
   - Team into R16 +1 / QF +2 / SF +4 / Final +8 · **Champion +15 · Golden Boot +10**.
   - Consider doubling Champion→25 / Golden Boot→20 if you want the bracket to swing the title (sim showed it's only ~7.5% of points otherwise).

**Sim findings to keep in mind:** fantasy ≈ 54% of points, predictions ≈ 39%, bracket ≈ 7.5%. Race stays open (62% of titles won after the group leader is overtaken). Skill→finish correlation is high (~0.78) — **blocks are the intended catch-up mechanic**, so don't water them down.

---

## 2. Tech stack (optimized for speed-to-ship)

| Layer | Choice | Why |
|---|---|---|
| Frontend | **Next.js 15 (App Router) + React + TypeScript + Tailwind + shadcn/ui** | Fastest path to a mobile-first PWA; everyone checks on phones. |
| Backend | **Next.js server actions / route handlers** | No separate API server to run. |
| DB | **Supabase Postgres** | Relational fits the data model; free tier covers 20 users many times over. |
| Auth | **Supabase Auth — magic-link (passwordless) + invite code** | No passwords to manage for 20 friends; gate sign-up with a shared code. |
| Scheduled polling + scoring | **Supabase Edge Function on a cron schedule** (or GitHub Actions hitting a protected route) | Frequent polling during matches; stays on free tiers. |
| Football data | **API-Football (API-Sports)** | Fixtures, events, **red cards**, goalscorers, **injuries** in one provider. |
| Hosting | **Vercel (Hobby)** | Free, zero-config Next.js deploys, preview URLs. |

**Scoring engine:** keep the rules in **one TypeScript module** (pure functions: `scorePrediction()`, `scorePlayerRound()`, `applyBlocks()`, `scoreBracket()`). It's testable in isolation and we already have the reference implementation in `sim.py` to port + validate against.

**Alternative (if you'd rather stay in the Classter/Azure ecosystem):** Azure Static Web Apps (free) + Azure Functions (consumption) + Azure Database for PostgreSQL Flexible Server (burstable B1ms). Works, but more setup and ~$15–30/mo for Postgres — not worth it for this vs. Supabase+Vercel under deadline.

---

## 3. Architecture / data flow

```
                 ┌──────────────────────────────┐
   API-Football  │  Edge Function (cron)         │
   (fixtures,    │  • poll live/finished matches │
    events,      │  • upsert results + events    │──► Supabase Postgres
    injuries) ───┤  • flag injured squad players │      (single source of truth)
                 │  • trigger scoring recompute  │            │
                 └──────────────────────────────┘            │
                                                              ▼
        Next.js (Vercel)  ◄── reads/writes via Supabase ──►  Tables + RLS
        • predictions / squad builder / bracket / blocks UI
        • leaderboard (materialized view, refreshed on recompute)
```

**Locking rule (one function, used everywhere):** a prediction/squad/block for a match or round is editable only until `kickoff/round_lock_time`. Enforce in DB (RLS + a `locked_at` check), not just the UI.

---

## 4. Data model (core tables)

- `profiles` (user, display name, avatar)
- `teams` (32→48 nations, strength prior, group)
- `players` (id, team, position, **price**, photo) — the fantasy universe; seed from API-Football squads
- `fixtures` (id, round, kickoff, team_a, team_b, status, score, **lock_time**)
- `match_events` (fixture_id, player_id, type: goal/own_goal/red_card/pen_miss/pen_save/clean_sheet, minute)
- `predictions` (user, fixture, score_a, score_b, scorer_picks[], red_card_bool, is_banker, points)
- `squads` (user, round) → `squad_players` (squad_id, player_id, is_captain)
- `blocks` (round, blocker, target_user, player_id, committed_at, revealed) + `shields` (user, round, used)
- `bracket_picks` (user, slot, team_id / scorer) — one-time, locked at first kickoff
- `scores` (user, round, column: pred/fantasy/bracket/block, points) → `leaderboard` (materialized view)

---

## 5. Deadline-driven phase plan

> Solo, part-time, 9 days is **aggressive but doable if scoped hard.** Blocks/rehaul aren't needed until the first KO round (~June 28), which buys ~2.5 extra weeks for those.

### 🔴 Sprint 1 — MUST be live before June 11 kickoff (Days 1–8)
The gate: **every manager must lock a squad + a bracket + matchday-1 predictions before the first whistle.**
1. Project setup: repo, Supabase project, Next.js scaffold, Vercel deploy, magic-link auth + invite code. *(0.5 day)*
2. Seed data: import 48 teams, fixtures (104 matches w/ lock times), and **player universe with prices** from API-Football. *(1–1.5 days)*
3. **Squad builder**: open pool, budget cap, formation, captain, lock-at-kickoff. *(2 days — biggest item)*
4. **Bracket entry**: pick the tree + champion + golden boot, lock at first kickoff. *(1 day)*
5. **Predictions entry**: per-match form, lock at each kickoff. *(1.5 days)*
6. Basic **results ingest** (manual commissioner entry is acceptable for launch; automate in Sprint 2). *(0.5 day)*

### 🟡 Sprint 2 — during the group stage (June 11–27, ~17 days of runway)
Predictions + squads are already collecting; now make them *count*.
7. Automated polling Edge Function (results, goals, red cards, clean sheets, injuries).
8. **Scoring engine** (port `sim.py` rules to TS, unit-test against 2022 data) + recompute pipeline.
9. **Leaderboard** with per-column breakdown (pred / fantasy / bracket).
10. Injury-replacement flow (auto-flag + open a single-swap window).

### 🟢 Sprint 3 — before Round of 32 (~June 28)
11. **Re-draft / rehaul window** between rounds (re-pick under cap from surviving teams).
12. **Blocks** (blind commit → reveal at lock, per-target cap) + **shields**.
13. **Differential bonus** computation.

### ⚪ Sprint 4 — polish (rolling)
14. Push notifications / email on lock reminders + reveal moments, group activity feed, PWA install, profile flair, end-of-tournament awards.

### 🛟 Fallback if 9 days is too tight
Collect **matchday-1 squads + brackets via a Google Form/Sheet** so you don't miss kickoff, then import into the app once Sprint 1 lands. Zero risk of missing the start.

---

## 6. Costs

| Item | Free tier (sufficient for 20 users?) | Paid | Recommendation |
|---|---|---|---|
| Vercel (hosting) | **Yes** — Hobby is free, non-commercial | Pro $20/mo | **Free** |
| Supabase (DB/Auth/cron/edge) | **Yes** — 500MB DB, 50K MAU, 500K fn calls | Pro $25/mo | Free; *optionally* Pro for the tournament for no-pause + daily backups |
| API-Football (data) | Risky — free tier 100 req/day won't cover live polling on 8–16-match days | **~€19/mo** (Pro, ~7.5K req/day) | **Pay €19/mo for June–July only, cancel after (~€38 total)** |
| Cron / polling | **Yes** — Supabase cron or GitHub Actions | — | Free |
| Domain (optional) | Free `*.vercel.app` | ~$12/yr | Optional |

**Bottom line:**
- **Truly free** if you accept free-tier constraints + commissioner-entered results = **$0**.
- **Recommended (paid data tier + optional Supabase Pro insurance for the 2 tournament months):** **≈ €38–88 total**, then back to ~$0.
- This is a pocket-change project. The scarce resource is **time, not money.**

---

## 7. When you're back — start here
1. Decide: full custom build vs. Google-Form fallback for matchday 1 (de-risks the deadline).
2. Create the Supabase project + Vercel project (both connectors are already available).
3. Sprint 1, item 1–2 (scaffold + seed data) — that unblocks everything else.
4. Port `sim.py` scoring rules into the TS scoring module early; reuse the 2022 dataset as the test fixture.
