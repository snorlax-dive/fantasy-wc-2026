import { describe, it, expect } from 'vitest'
import { projectedPointsPerMatch, projectedPoints, priceFromExpectedPoints } from '@/lib/projection'
import type { ProjectionInput } from '@/lib/projection'

const base = (): ProjectionInput => ({
  pos: 'MID',
  attack: 0.7,
  defense: 0.7,
  startProb: 1,
  matchesExpected: 3,
  midRole: 'ATK',
})

// ---------------------------------------------------------------------------
// projectedPointsPerMatch — shrinkage
// ---------------------------------------------------------------------------
describe('projectedPointsPerMatch — shrinkage', () => {
  it('no realized data → returns pure prior', () => {
    const input = base()
    const withoutRealized = projectedPointsPerMatch(input)
    const withZeroMatches = projectedPointsPerMatch({ ...input, realized: { matches: 0, pointsPerMatch: 10 } })
    expect(withoutRealized).toBeCloseTo(withZeroMatches)
  })

  it('shrinkage formula: (w*prior + n*obs) / (w+n)', () => {
    const prior = projectedPointsPerMatch(base())
    const result = projectedPointsPerMatch({
      ...base(),
      realized: { matches: 1, pointsPerMatch: prior + 3 },
      priorWeight: 3,
    })
    const expected = (3 * prior + 1 * (prior + 3)) / 4
    expect(result).toBeCloseTo(expected, 5)
  })

  it('many realized matches → result approaches observed', () => {
    const observed = 6.0
    const result = projectedPointsPerMatch({
      ...base(),
      realized: { matches: 100, pointsPerMatch: observed },
      priorWeight: 3,
    })
    expect(result).toBeCloseTo(observed, 0)
  })

  it('custom priorWeight respected', () => {
    const prior = projectedPointsPerMatch(base())
    const obs = prior + 4
    const result = projectedPointsPerMatch({
      ...base(),
      realized: { matches: 1, pointsPerMatch: obs },
      priorWeight: 1,
    })
    const expected = (1 * prior + 1 * obs) / 2
    expect(result).toBeCloseTo(expected, 5)
  })
})

// ---------------------------------------------------------------------------
// projectedPointsPerMatch — startProb
// ---------------------------------------------------------------------------
describe('projectedPointsPerMatch — startProb', () => {
  it('startProb=0 → very low output (no appearance, no CS, no goals)', () => {
    const result = projectedPointsPerMatch({ ...base(), startProb: 0 })
    // fringe player gets appearance ~0.4 but that's the base; all perf bonuses → 0
    expect(result).toBeGreaterThanOrEqual(0)
    expect(result).toBeLessThan(1)
  })

  it('startProb=1 > startProb=0 for same player', () => {
    const starter = projectedPointsPerMatch({ ...base(), startProb: 1 })
    const fringe = projectedPointsPerMatch({ ...base(), startProb: 0 })
    expect(starter).toBeGreaterThan(fringe)
  })
})

// ---------------------------------------------------------------------------
// projectedPointsPerMatch — MID role split
// ---------------------------------------------------------------------------
describe('projectedPointsPerMatch — MID role split', () => {
  it('ATK mid projects higher than DEF mid (same team/opponent)', () => {
    const atk = projectedPointsPerMatch({ ...base(), midRole: 'ATK' })
    const def = projectedPointsPerMatch({ ...base(), midRole: 'DEF' })
    expect(atk).toBeGreaterThan(def)
  })
})

// ---------------------------------------------------------------------------
// projectedPointsPerMatch — opponentAttack
// ---------------------------------------------------------------------------
describe('projectedPointsPerMatch — opponentAttack', () => {
  it('strong opponent → lower clean sheet contribution vs weak opponent', () => {
    const vsStrong = projectedPointsPerMatch({ ...base(), pos: 'GK', opponentAttack: 0.9 })
    const vsWeak   = projectedPointsPerMatch({ ...base(), pos: 'GK', opponentAttack: 0.2 })
    expect(vsWeak).toBeGreaterThan(vsStrong)
  })

  it('omitting opponentAttack uses 0.55 (neutral)', () => {
    const noOpp      = projectedPointsPerMatch({ ...base(), pos: 'GK' })
    const neutralOpp = projectedPointsPerMatch({ ...base(), pos: 'GK', opponentAttack: 0.55 })
    expect(noOpp).toBeCloseTo(neutralOpp, 8)
  })
})

// ---------------------------------------------------------------------------
// projectedPoints
// ---------------------------------------------------------------------------
describe('projectedPoints', () => {
  it('scales per-match by matchesExpected', () => {
    const perMatch = projectedPointsPerMatch(base())
    const total = projectedPoints(base())
    expect(total).toBeCloseTo(perMatch * 3, 5)
  })
})

// ---------------------------------------------------------------------------
// priceFromExpectedPoints — clamping
// ---------------------------------------------------------------------------
describe('priceFromExpectedPoints — clamping', () => {
  it('GK very low xPts → floor £4.0', () => {
    expect(priceFromExpectedPoints('GK', 0)).toBe(4.0)
  })
  it('GK very high xPts → ceiling £13.5', () => {
    expect(priceFromExpectedPoints('GK', 100)).toBe(13.5)
  })
  it('DEF floor → £4.0', () => {
    expect(priceFromExpectedPoints('DEF', 0)).toBe(4.0)
  })
  it('MID floor → £4.5', () => {
    expect(priceFromExpectedPoints('MID', 0)).toBe(4.5)
  })
  it('FWD floor → £4.5', () => {
    expect(priceFromExpectedPoints('FWD', 0)).toBe(4.5)
  })
  it('any position extreme high → £13.5', () => {
    for (const pos of ['GK', 'DEF', 'MID', 'FWD'] as const) {
      expect(priceFromExpectedPoints(pos, 999)).toBe(13.5)
    }
  })
})

describe('priceFromExpectedPoints — rounding', () => {
  it('result is always a multiple of 0.5', () => {
    const testValues = [0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 5.0]
    for (const pos of ['GK', 'DEF', 'MID', 'FWD'] as const) {
      for (const v of testValues) {
        const price = priceFromExpectedPoints(pos, v)
        expect(price * 2).toBeCloseTo(Math.round(price * 2), 5)
      }
    }
  })
})

describe('priceFromExpectedPoints — monotonicity', () => {
  it('higher xPts → same or higher price (same position)', () => {
    for (const pos of ['GK', 'DEF', 'MID', 'FWD'] as const) {
      let prev = priceFromExpectedPoints(pos, 0)
      for (let v = 0.25; v <= 4; v += 0.25) {
        const curr = priceFromExpectedPoints(pos, v)
        expect(curr).toBeGreaterThanOrEqual(prev)
        prev = curr
      }
    }
  })
})
