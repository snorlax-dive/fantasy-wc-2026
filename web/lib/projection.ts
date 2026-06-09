// Expected-points projection — mirrors the component structure of
// `playerFantasyPoints()` in lib/scoring.ts so that price is *literally*
// derived from the rules a player is judged on, rather than an arbitrary
// hash. Pure functions only — no I/O.
//
// Two call sites:
//   - seed time: pure prior (no `realized` data yet)
//   - re-draft repricing: prior blended with this stage's accumulated form
//     via a simple empirical-Bayes shrinkage average
//
// Note on defensive actions and GK saves:
//   The scoring rules award points for tackles+interceptions and GK saves, but
//   these are deliberately excluded from the pricing *prior* because they are
//   too volatile and game-state-dependent to project reliably pre-match. Clean
//   sheets already capture a GK/DEF's defensive value in pricing; the save and
//   tackle bonuses are "upside surprises" rewarded in actual gameplay. Assists
//   ARE included since they scale predictably with team attack quality.

import type { Pos } from './scoring'
import { GOAL_PTS } from './scoring'

export type ProjectionInput = {
  pos: Pos
  attack: number          // 0..1 — team's attacking quality (drives goals/assists)
  defense: number         // 0..1 — team's defensive quality (drives clean sheets)
  startProb: number       // 0..1 — probability of starting / playing 60'+
  matchesExpected: number // matches to project the total over (1 per KO round; used by fixture-aware seed)
  opponentAttack?: number // 0..1 — upcoming opponent's attack rating; adjusts clean-sheet probability
  midRole?: 'ATK' | 'DEF' // for MID only: attacking (Pedri/Bellingham) vs holding (Casemiro/Tchouaméni)
  realized?: { matches: number; pointsPerMatch: number } // accumulated form, for re-pricing
  priorWeight?: number    // shrinkage constant — "virtual matches" of prior belief (default 3)
  personalAttack?: number // 0..1 — per-player attack quality; replaces team attack for goals/assists.
                          // Clean sheet probability still uses team defense. Set by step=qualifiers.
}

// Goals per match at startProb=1, attack=1. MID is split by midRole at call time.
// FWD raised 0.32→0.42 so forwards price above defenders on the same team.
const BASE_GOAL_RATE: Record<Pos, number> = { GK: 0.002, DEF: 0.04, MID: 0.14, FWD: 0.42 }

// Assists per match at startProb=1, attack=1.
// FWD raised 0.10→0.15 to give attacking contribution more pricing weight.
const BASE_ASSIST_RATE: Record<Pos, number> = { GK: 0.003, DEF: 0.04, MID: 0.18, FWD: 0.15 }

const CLEAN_SHEET_BONUS: Record<Pos, number> = { GK: 4, DEF: 4, MID: 1, FWD: 0 }

// Per-match prior — assembles the predictable components of playerFantasyPoints():
// appearance, goals, assists, and clean sheets. Saves and defensive actions are
// excluded here because they're too volatile to project pre-match (see file header).
function priorPointsPerMatch(input: ProjectionInput): number {
  const { pos, attack, defense, startProb } = input

  // Starters bank the full appearance bonus; fringe players occasionally pick
  // up sub minutes worth the lesser +1.
  const appearance = startProb * 2 + (1 - startProb) * 0.4

  // MID goal/assist rate depends on role (ATK vs DEF mid).
  const goalRate   = pos === 'MID' ? (input.midRole === 'ATK' ? 0.20 : 0.07) : BASE_GOAL_RATE[pos]
  const assistRate = pos === 'MID' ? (input.midRole === 'ATK' ? 0.24 : 0.10) : BASE_ASSIST_RATE[pos]

  // personalAttack overrides team attack for goal/assist calculation only.
  // Clean sheet probability continues to use team defense.
  const atkForGoals = input.personalAttack ?? attack

  const goalPts   = goalRate * atkForGoals * startProb * GOAL_PTS[pos]
  const assistPts = assistRate * atkForGoals * startProb * 3

  // Clean-sheet probability: discounted by opponent attack (strong opponents score more).
  // opponentAttack defaults to 0.55 (average team) when not supplied, keeping the formula
  // identical to the old behavior for callers that don't pass a fixture opponent.
  const oppAtk = input.opponentAttack ?? 0.55
  const cleanSheetProb = defense * 0.45 * (1 - 0.35 * oppAtk)
  const cleanSheetPts = startProb * cleanSheetProb * CLEAN_SHEET_BONUS[pos]

  // Small constant-ish expectations, gated by minutes likelihood.
  const penSavePts = pos === 'GK' ? startProb * 0.02 * 5 : 0
  const penMissPts = pos === 'FWD' || pos === 'MID' ? startProb * 0.01 * -2 : 0
  const cardPts    = startProb * 0.04 * -3    // red card expectation
  const yellowPts  = startProb * 0.12 * -1    // ~12% yellow card rate per match
  const ownGoalPts = startProb * 0.004 * -2

  return appearance + goalPts + assistPts + cleanSheetPts
    + penSavePts + penMissPts + cardPts + yellowPts + ownGoalPts
}

// Per-match projection — the prior, optionally shrunk toward observed form.
export function projectedPointsPerMatch(input: ProjectionInput): number {
  const prior = priorPointsPerMatch(input)
  const realized = input.realized
  if (!realized || realized.matches <= 0) return prior

  const w = input.priorWeight ?? 3
  return (w * prior + realized.matches * realized.pointsPerMatch) / (w + realized.matches)
}

// Total projected points for the upcoming stage. When called from the fixture-aware seed path
// (matchesExpected=1 per fixture, summed externally), this just returns the per-match rate.
export function projectedPoints(input: ProjectionInput): number {
  return projectedPointsPerMatch(input) * input.matchesExpected
}

const PRICE_FLOOR: Record<Pos, number> = { GK: 4.0, DEF: 4.0, MID: 4.5, FWD: 4.5 }
const PRICE_CEIL = 13.5

// Calibrated per-match xPts range for each position — derived from running the model
// at realistic (attack/defense/startProb) extremes across the 48-team field.
// FWD max raised 3.2→3.8 to accommodate the higher achievable xPts after the
// BASE_GOAL_RATE/BASE_ASSIST_RATE calibration.
const XPTS_RANGE: Record<Pos, { min: number; max: number }> = {
  GK:  { min: 1.5, max: 3.5 },
  DEF: { min: 1.0, max: 3.5 },
  MID: { min: 0.8, max: 3.2 },
  FWD: { min: 1.0, max: 3.8 },
}

const PRICE_SKEW = 1.6

// Maps a *per-match* projected-points rate to a price (clamped, nearest 0.5).
// Keyed off the per-match rate so price reflects player quality independent of
// how many matches remain in the stage being drafted.
export function priceFromExpectedPoints(pos: Pos, perMatchPts: number): number {
  const { min, max } = XPTS_RANGE[pos]
  const t = Math.max(0, Math.min(1, (perMatchPts - min) / (max - min)))
  const raw = PRICE_FLOOR[pos] + (PRICE_CEIL - PRICE_FLOOR[pos]) * Math.pow(t, PRICE_SKEW)
  return Math.min(PRICE_CEIL, Math.max(PRICE_FLOOR[pos], Math.round(raw * 2) / 2))
}

// Derives a per-player personal_attack (0.10–0.97) from observed qualifier
// goals and assists, shrunk toward team attack via empirical-Bayes (w=8).
// Returns null for GK/DEF (too few goals/assists to be a meaningful signal)
// and when there is no playing time.
export function derivePersonalAttack(
  pos: Pos,
  midRole: 'ATK' | 'DEF' | undefined = undefined,
  teamAttack: number,
  observed: { totalGoals: number; totalAssists: number; totalMinutes: number; totalAppearances: number },
): number | null {
  if (pos === 'GK' || pos === 'DEF') return null
  if (observed.totalMinutes <= 0 || observed.totalAppearances <= 0) return null

  const effectiveMidRole = midRole ?? 'DEF'
  const goalRate   = pos === 'MID' ? (effectiveMidRole === 'ATK' ? 0.20 : 0.07) : BASE_GOAL_RATE[pos]
  const assistRate = pos === 'MID' ? (effectiveMidRole === 'ATK' ? 0.24 : 0.10) : BASE_ASSIST_RATE[pos]
  const modelRate  = goalRate * GOAL_PTS[pos] + assistRate * 3
  if (modelRate <= 0) return null

  const ptsPer90 = ((observed.totalGoals * GOAL_PTS[pos] + observed.totalAssists * 3) / observed.totalMinutes) * 90
  const implied  = ptsPer90 / modelRate

  // Shrink toward team attack: need strong evidence to deviate from team rating.
  // Use minutes/90 (full-game equivalents) as sample size so short cameos (high
  // per-90 rate from tiny minutes) don't drive personal_attack to the clamp.
  const w = 8
  const n = observed.totalMinutes / 90
  const shrunk = (w * teamAttack + n * implied) / (w + n)
  return Math.min(0.97, Math.max(0.10, shrunk))
}
