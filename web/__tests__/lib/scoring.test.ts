import { describe, it, expect } from 'vitest'
import { playerFantasyPoints, scorePrediction, type PlayerStat, type Prediction, type FixtureResult } from '@/lib/scoring'

const baseStat = (): PlayerStat => ({
  minutes: 90,
  goals: 0,
  assists: 0,
  own_goals: 0,
  red_card: false,
  yellow_card: false,
  pens_saved: 0,
  pens_missed: 0,
  clean_sheet: false,
  saves: 0,
  tackles: 0,
  interceptions: 0,
})

const basePred = (): Prediction => ({
  pred_a: 1,
  pred_b: 0,
  scorer1: null,
  scorer2: null,
  red_card_pred: null,
  is_banker: false,
})

const baseResult = (): FixtureResult => ({
  score_a: 1,
  score_b: 0,
  had_red_card: false,
  scorerIds: new Set(),
})

// ---------------------------------------------------------------------------
// playerFantasyPoints
// ---------------------------------------------------------------------------
describe('playerFantasyPoints — appearance', () => {
  it('0 minutes → 0 pts', () => {
    expect(playerFantasyPoints({ ...baseStat(), minutes: 0 }, 'MID')).toBe(0)
  })
  it('1 minute → +1 pt', () => {
    expect(playerFantasyPoints({ ...baseStat(), minutes: 1 }, 'MID')).toBe(1)
  })
  it('59 minutes → +1 pt', () => {
    expect(playerFantasyPoints({ ...baseStat(), minutes: 59 }, 'MID')).toBe(1)
  })
  it('60 minutes → +2 pts', () => {
    expect(playerFantasyPoints({ ...baseStat(), minutes: 60 }, 'MID')).toBe(2)
  })
  it('90 minutes → +2 pts', () => {
    expect(playerFantasyPoints({ ...baseStat(), minutes: 90 }, 'MID')).toBe(2)
  })
})

describe('playerFantasyPoints — goals', () => {
  it('GK 1 goal → +6', () => {
    expect(playerFantasyPoints({ ...baseStat(), goals: 1 }, 'GK')).toBe(2 + 6)
  })
  it('DEF 1 goal → +6', () => {
    expect(playerFantasyPoints({ ...baseStat(), goals: 1 }, 'DEF')).toBe(2 + 6)
  })
  it('MID 1 goal → +5', () => {
    expect(playerFantasyPoints({ ...baseStat(), goals: 1 }, 'MID')).toBe(2 + 5)
  })
  it('FWD 1 goal → +4', () => {
    expect(playerFantasyPoints({ ...baseStat(), goals: 1 }, 'FWD')).toBe(2 + 4)
  })
  it('FWD 2 goals → +8', () => {
    expect(playerFantasyPoints({ ...baseStat(), goals: 2 }, 'FWD')).toBe(2 + 8)
  })
  it('GK 2 goals → +12', () => {
    expect(playerFantasyPoints({ ...baseStat(), goals: 2 }, 'GK')).toBe(2 + 12)
  })
})

describe('playerFantasyPoints — assists', () => {
  it('1 assist → +3 (position-independent)', () => {
    for (const pos of ['GK', 'DEF', 'MID', 'FWD'] as const) {
      expect(playerFantasyPoints({ ...baseStat(), assists: 1 }, pos)).toBe(2 + 3)
    }
  })
  it('2 assists → +6', () => {
    expect(playerFantasyPoints({ ...baseStat(), assists: 2 }, 'MID')).toBe(2 + 6)
  })
})

describe('playerFantasyPoints — clean sheet', () => {
  it('GK clean sheet 60+ min → +4', () => {
    expect(playerFantasyPoints({ ...baseStat(), clean_sheet: true }, 'GK')).toBe(2 + 4)
  })
  it('DEF clean sheet 60+ min → +4', () => {
    expect(playerFantasyPoints({ ...baseStat(), clean_sheet: true }, 'DEF')).toBe(2 + 4)
  })
  it('MID clean sheet 60+ min → +1', () => {
    expect(playerFantasyPoints({ ...baseStat(), clean_sheet: true }, 'MID')).toBe(2 + 1)
  })
  it('FWD clean sheet → 0', () => {
    expect(playerFantasyPoints({ ...baseStat(), clean_sheet: true }, 'FWD')).toBe(2)
  })
  it('GK clean sheet with 59 min → no bonus (minutes gate)', () => {
    expect(playerFantasyPoints({ ...baseStat(), minutes: 59, clean_sheet: true }, 'GK')).toBe(1)
  })
  it('clean_sheet false with 60+ min → 0 bonus', () => {
    expect(playerFantasyPoints({ ...baseStat(), clean_sheet: false }, 'GK')).toBe(2)
  })
})

describe('playerFantasyPoints — penalties', () => {
  it('pens_saved=1 → +5', () => {
    expect(playerFantasyPoints({ ...baseStat(), pens_saved: 1 }, 'GK')).toBe(2 + 5)
  })
  it('pens_saved=2 → +10', () => {
    expect(playerFantasyPoints({ ...baseStat(), pens_saved: 2 }, 'GK')).toBe(2 + 10)
  })
  it('pens_missed=1 → -2', () => {
    expect(playerFantasyPoints({ ...baseStat(), pens_missed: 1 }, 'FWD')).toBe(2 - 2)
  })
  it('pens_missed=2 → -4', () => {
    expect(playerFantasyPoints({ ...baseStat(), pens_missed: 2 }, 'FWD')).toBe(2 - 4)
  })
})

describe('playerFantasyPoints — cards', () => {
  it('red_card=true → -3', () => {
    expect(playerFantasyPoints({ ...baseStat(), red_card: true }, 'MID')).toBe(2 - 3)
  })
  it('yellow_card=true → -1', () => {
    expect(playerFantasyPoints({ ...baseStat(), yellow_card: true }, 'MID')).toBe(2 - 1)
  })
  it('both cards → -4', () => {
    expect(playerFantasyPoints({ ...baseStat(), red_card: true, yellow_card: true }, 'MID')).toBe(2 - 4)
  })
})

describe('playerFantasyPoints — own goals', () => {
  it('1 own goal → -2', () => {
    expect(playerFantasyPoints({ ...baseStat(), own_goals: 1 }, 'DEF')).toBe(2 - 2)
  })
  it('2 own goals → -4', () => {
    expect(playerFantasyPoints({ ...baseStat(), own_goals: 2 }, 'DEF')).toBe(2 - 4)
  })
})

describe('playerFantasyPoints — saves', () => {
  it('0, 1, 2 saves → 0 pts', () => {
    expect(playerFantasyPoints({ ...baseStat(), saves: 0 }, 'GK')).toBe(2)
    expect(playerFantasyPoints({ ...baseStat(), saves: 1 }, 'GK')).toBe(2)
    expect(playerFantasyPoints({ ...baseStat(), saves: 2 }, 'GK')).toBe(2)
  })
  it('3 saves → +1', () => {
    expect(playerFantasyPoints({ ...baseStat(), saves: 3 }, 'GK')).toBe(2 + 1)
  })
  it('6 saves → +2', () => {
    expect(playerFantasyPoints({ ...baseStat(), saves: 6 }, 'GK')).toBe(2 + 2)
  })
  it('5 saves → +1 (floor division)', () => {
    expect(playerFantasyPoints({ ...baseStat(), saves: 5 }, 'GK')).toBe(2 + 1)
  })
})

describe('playerFantasyPoints — defensive actions', () => {
  it('0 tackles + 0 interceptions → 0', () => {
    expect(playerFantasyPoints({ ...baseStat(), tackles: 0, interceptions: 0 }, 'DEF')).toBe(2)
  })
  it('3 combined → 0 (below threshold of 4)', () => {
    expect(playerFantasyPoints({ ...baseStat(), tackles: 2, interceptions: 1 }, 'DEF')).toBe(2)
  })
  it('4 combined → +1', () => {
    expect(playerFantasyPoints({ ...baseStat(), tackles: 4, interceptions: 0 }, 'DEF')).toBe(2 + 1)
  })
  it('7 combined → +1 (floor division)', () => {
    expect(playerFantasyPoints({ ...baseStat(), tackles: 4, interceptions: 3 }, 'DEF')).toBe(2 + 1)
  })
  it('8 combined → +2', () => {
    expect(playerFantasyPoints({ ...baseStat(), tackles: 5, interceptions: 3 }, 'DEF')).toBe(2 + 2)
  })
  it('12 combined → +2 (cap at 2)', () => {
    expect(playerFantasyPoints({ ...baseStat(), tackles: 6, interceptions: 6 }, 'DEF')).toBe(2 + 2)
  })
})

describe('playerFantasyPoints — combined scenarios', () => {
  it('GK 90min clean sheet 3 saves 1 yellow → 6', () => {
    const stat: PlayerStat = { ...baseStat(), clean_sheet: true, saves: 3, yellow_card: true }
    expect(playerFantasyPoints(stat, 'GK')).toBe(2 + 4 + 1 - 1) // 6
  })
  it('FWD 60min 2 goals 1 assist pens_missed=1 → 11', () => {
    const stat: PlayerStat = { ...baseStat(), goals: 2, assists: 1, pens_missed: 1 }
    expect(playerFantasyPoints(stat, 'FWD')).toBe(2 + 8 + 3 - 2) // 11
  })
  it('DEF 45min 1 goal red card → 4', () => {
    const stat: PlayerStat = { ...baseStat(), minutes: 45, goals: 1, red_card: true }
    expect(playerFantasyPoints(stat, 'DEF')).toBe(1 + 6 - 3) // 4
  })
})

// ---------------------------------------------------------------------------
// scorePrediction
// ---------------------------------------------------------------------------
describe('scorePrediction — null handling', () => {
  it('pred_a=null → 0', () => {
    expect(scorePrediction({ ...basePred(), pred_a: null }, baseResult())).toBe(0)
  })
  it('pred_b=null → 0', () => {
    expect(scorePrediction({ ...basePred(), pred_b: null }, baseResult())).toBe(0)
  })
  it('both null → 0', () => {
    expect(scorePrediction({ ...basePred(), pred_a: null, pred_b: null }, baseResult())).toBe(0)
  })
})

describe('scorePrediction — base scoreline points', () => {
  it('exact scoreline match → 5', () => {
    const pred = { ...basePred(), pred_a: 2, pred_b: 1 }
    const result = { ...baseResult(), score_a: 2, score_b: 1 }
    expect(scorePrediction(pred, result)).toBe(5)
  })
  it('correct result + exact goal margin (2-1 pred, 3-2 result) → 3', () => {
    const pred = { ...basePred(), pred_a: 2, pred_b: 1 }
    const result = { ...baseResult(), score_a: 3, score_b: 2 }
    expect(scorePrediction(pred, result)).toBe(3)
  })
  it('correct result + different margin (2-0 pred, 3-0 result) → 2', () => {
    const pred = { ...basePred(), pred_a: 2, pred_b: 0 }
    const result = { ...baseResult(), score_a: 3, score_b: 0 }
    expect(scorePrediction(pred, result)).toBe(2)
  })
  it('wrong result (predicted win, got loss) → 0', () => {
    const pred = { ...basePred(), pred_a: 1, pred_b: 0 }
    const result = { ...baseResult(), score_a: 0, score_b: 1 }
    expect(scorePrediction(pred, result)).toBe(0)
  })
  it('draw predicted + draw result, same score (1-1, 1-1) → 5', () => {
    const pred = { ...basePred(), pred_a: 1, pred_b: 1 }
    const result = { ...baseResult(), score_a: 1, score_b: 1 }
    expect(scorePrediction(pred, result)).toBe(5)
  })
  it('draw predicted + draw result, different score (1-1 pred, 2-2 result) → 3', () => {
    const pred = { ...basePred(), pred_a: 1, pred_b: 1 }
    const result = { ...baseResult(), score_a: 2, score_b: 2 }
    expect(scorePrediction(pred, result)).toBe(3)
  })
  it('draw predicted, win result → 0', () => {
    const pred = { ...basePred(), pred_a: 1, pred_b: 1 }
    const result = { ...baseResult(), score_a: 2, score_b: 0 }
    expect(scorePrediction(pred, result)).toBe(0)
  })
})

describe('scorePrediction — scorer bonuses', () => {
  it('scorer1 in scorerIds → +2', () => {
    const pred = { ...basePred(), pred_a: 2, pred_b: 1, scorer1: 10 }
    const result = { ...baseResult(), score_a: 2, score_b: 1, scorerIds: new Set([10]) }
    expect(scorePrediction(pred, result)).toBe(5 + 2)
  })
  it('scorer2 in scorerIds → +2', () => {
    const pred = { ...basePred(), pred_a: 2, pred_b: 1, scorer2: 20 }
    const result = { ...baseResult(), score_a: 2, score_b: 1, scorerIds: new Set([20]) }
    expect(scorePrediction(pred, result)).toBe(5 + 2)
  })
  it('both scorers hit → +4', () => {
    const pred = { ...basePred(), pred_a: 2, pred_b: 1, scorer1: 10, scorer2: 20 }
    const result = { ...baseResult(), score_a: 2, score_b: 1, scorerIds: new Set([10, 20]) }
    expect(scorePrediction(pred, result)).toBe(5 + 4)
  })
  it('scorer1 null → no bonus', () => {
    const pred = { ...basePred(), pred_a: 2, pred_b: 1, scorer1: null }
    const result = { ...baseResult(), score_a: 2, score_b: 1, scorerIds: new Set([10]) }
    expect(scorePrediction(pred, result)).toBe(5)
  })
  it('scorer not in Set → no bonus', () => {
    const pred = { ...basePred(), pred_a: 2, pred_b: 1, scorer1: 99 }
    const result = { ...baseResult(), score_a: 2, score_b: 1, scorerIds: new Set([10]) }
    expect(scorePrediction(pred, result)).toBe(5)
  })
})

describe('scorePrediction — red card bonus', () => {
  const matchPred = { ...basePred(), pred_a: 2, pred_b: 1 }
  const matchResult = { ...baseResult(), score_a: 2, score_b: 1 }
  it('predicted true, had red card → +4', () => {
    expect(scorePrediction({ ...matchPred, red_card_pred: true }, { ...matchResult, had_red_card: true })).toBe(5 + 4)
  })
  it('predicted true, no red card → +0', () => {
    expect(scorePrediction({ ...matchPred, red_card_pred: true }, { ...matchResult, had_red_card: false })).toBe(5)
  })
  it('predicted false, no red card → +1', () => {
    expect(scorePrediction({ ...matchPred, red_card_pred: false }, { ...matchResult, had_red_card: false })).toBe(5 + 1)
  })
  it('predicted false, had red card → +0', () => {
    expect(scorePrediction({ ...matchPred, red_card_pred: false }, { ...matchResult, had_red_card: true })).toBe(5)
  })
  it('predicted null → 0', () => {
    expect(scorePrediction({ ...matchPred, red_card_pred: null }, { ...matchResult, had_red_card: true })).toBe(5)
  })
})

describe('scorePrediction — banker doubling', () => {
  it('banker doubles all points', () => {
    const pred: Prediction = { pred_a: 2, pred_b: 1, scorer1: 10, scorer2: 20, red_card_pred: true, is_banker: true }
    const result: FixtureResult = { score_a: 2, score_b: 1, had_red_card: true, scorerIds: new Set([10, 20]) }
    // 5 base + 4 scorers + 4 red card = 13, doubled → 26
    expect(scorePrediction(pred, result)).toBe(26)
  })
  it('banker on 0-base prediction still doubles scorer points', () => {
    const pred: Prediction = { pred_a: 1, pred_b: 0, scorer1: 10, scorer2: null, red_card_pred: null, is_banker: true }
    const result: FixtureResult = { score_a: 0, score_b: 1, had_red_card: false, scorerIds: new Set([10]) }
    // 0 base (wrong result) + 2 scorer = 2, doubled → 4
    expect(scorePrediction(pred, result)).toBe(4)
  })
})
