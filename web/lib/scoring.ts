// Pure scoring rules — ported from sim.py. No I/O, fully unit-testable.

export type Pos = 'GK' | 'DEF' | 'MID' | 'FWD'

const GOAL_PTS: Record<Pos, number> = { GK: 6, DEF: 6, MID: 5, FWD: 4 }

export type PlayerStat = {
  minutes: number
  goals: number
  own_goals: number
  red_card: boolean
  pens_saved: number
  pens_missed: number
  clean_sheet: boolean
}

// Fantasy points for one player in one match.
export function playerFantasyPoints(s: PlayerStat, pos: Pos): number {
  let p = 0
  if (s.minutes >= 60) p += 2
  else if (s.minutes >= 1) p += 1
  p += s.goals * GOAL_PTS[pos]
  if (s.clean_sheet && s.minutes >= 60) {
    if (pos === 'GK' || pos === 'DEF') p += 4
    else if (pos === 'MID') p += 1
  }
  p += s.pens_saved * 5
  p -= s.pens_missed * 2
  if (s.red_card) p -= 3
  p -= s.own_goals * 2
  return p
}

export type Prediction = {
  pred_a: number | null
  pred_b: number | null
  scorer1: number | null
  scorer2: number | null
  red_card_pred: boolean | null
  is_banker: boolean
}

export type FixtureResult = {
  score_a: number
  score_b: number
  had_red_card: boolean
  scorerIds: Set<number>
}

// Prediction points for one match.
export function scorePrediction(pred: Prediction, r: FixtureResult): number {
  if (pred.pred_a == null || pred.pred_b == null) return 0
  const pa = pred.pred_a
  const pb = pred.pred_b

  let base = 0
  if (pa === r.score_a && pb === r.score_b) {
    base = 5 // exact scoreline
  } else {
    const predSign = Math.sign(pa - pb)
    const actSign = Math.sign(r.score_a - r.score_b)
    if (predSign === actSign) {
      base = pa - pb === r.score_a - r.score_b ? 3 : 2 // right result, exact margin vs not
    }
  }

  let pts = base
  for (const s of [pred.scorer1, pred.scorer2]) {
    if (s != null && r.scorerIds.has(s)) pts += 2 // anytime scorer
  }
  if (pred.red_card_pred === true) pts += r.had_red_card ? 4 : 0
  else if (pred.red_card_pred === false) pts += r.had_red_card ? 0 : 1

  if (pred.is_banker) pts *= 2
  return pts
}

export const BRACKET_POINTS: Record<string, number> = {
  REACH_R16: 1,
  REACH_QF: 2,
  REACH_SF: 4,
  REACH_FINAL: 8,
  CHAMPION: 15,
  GOLDEN_BOOT: 10,
}

export const DIFFERENTIAL_THRESHOLD = 0.2
export const DIFFERENTIAL_BONUS_PER_GOAL = 2
