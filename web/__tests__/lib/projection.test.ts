import { describe, it, expect } from 'vitest'
import { projectedPointsPerMatch, projectedPoints, priceFromExpectedPoints, derivePersonalAttack } from '@/lib/projection'
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

// ---------------------------------------------------------------------------
// projectedPointsPerMatch — personalAttack field
// ---------------------------------------------------------------------------
describe('projectedPointsPerMatch — personalAttack', () => {
  it('personalAttack raises FWD projection above team attack', () => {
    const input: ProjectionInput = {
      pos: 'FWD', attack: 0.6, defense: 0.6, startProb: 0.9, matchesExpected: 1,
    }
    const withTeam     = projectedPointsPerMatch(input)
    const withPersonal = projectedPointsPerMatch({ ...input, personalAttack: 0.95 })
    expect(withPersonal).toBeGreaterThan(withTeam)
  })

  it('personalAttack on GK has negligible effect (goal/assist rates are near zero)', () => {
    const input: ProjectionInput = {
      pos: 'GK', attack: 0.5, defense: 0.8, startProb: 0.9, matchesExpected: 1, opponentAttack: 0.55,
    }
    const without = projectedPointsPerMatch(input)
    const with_   = projectedPointsPerMatch({ ...input, personalAttack: 0.97 })
    expect(Math.abs(with_ - without)).toBeLessThan(0.05)
  })

  it('undefined personalAttack behaves identically to omitting it', () => {
    const input: ProjectionInput = {
      pos: 'FWD', attack: 0.7, defense: 0.7, startProb: 0.9, matchesExpected: 1,
    }
    expect(projectedPointsPerMatch(input)).toBeCloseTo(
      projectedPointsPerMatch({ ...input, personalAttack: undefined })
    )
  })
})

// ---------------------------------------------------------------------------
// FWD calibration: FWD should price above DEF on same team
// ---------------------------------------------------------------------------
describe('projectedPointsPerMatch — FWD > DEF calibration', () => {
  it('FWD starter projects higher per-match xPts than DEF starter on the same team', () => {
    const team = { attack: 0.75, defense: 0.70 }
    const fwd = projectedPointsPerMatch({ pos: 'FWD', ...team, startProb: 0.80, matchesExpected: 1 })
    const def = projectedPointsPerMatch({ pos: 'DEF', ...team, startProb: 0.80, matchesExpected: 1 })
    expect(fwd).toBeGreaterThan(def)
  })
})

// ---------------------------------------------------------------------------
// derivePersonalAttack
// ---------------------------------------------------------------------------
describe('derivePersonalAttack', () => {
  it('returns null for GK', () => {
    expect(derivePersonalAttack('GK', undefined, 0.8, {
      totalGoals: 2, totalAssists: 1, totalMinutes: 900, totalAppearances: 10,
    })).toBeNull()
  })

  it('returns null for DEF', () => {
    expect(derivePersonalAttack('DEF', undefined, 0.8, {
      totalGoals: 1, totalAssists: 2, totalMinutes: 900, totalAppearances: 10,
    })).toBeNull()
  })

  it('returns null when totalMinutes is 0', () => {
    expect(derivePersonalAttack('FWD', undefined, 0.8, {
      totalGoals: 0, totalAssists: 0, totalMinutes: 0, totalAppearances: 0,
    })).toBeNull()
  })

  it('elite scorer: result clamped to 0.97', () => {
    // 10 goals in 900 min = 1.0 g/90, far above model rate → implied >> 1.0 → clamps
    const result = derivePersonalAttack('FWD', undefined, 0.55, {
      totalGoals: 10, totalAssists: 0, totalMinutes: 900, totalAppearances: 10,
    })
    expect(result).toBe(0.97)
  })

  it('zero scorer: personal_attack below team attack (shrunk toward 0 via prior)', () => {
    const result = derivePersonalAttack('FWD', undefined, 0.8, {
      totalGoals: 0, totalAssists: 0, totalMinutes: 900, totalAppearances: 10,
    })
    expect(result).not.toBeNull()
    expect(result!).toBeLessThan(0.8)
    expect(result!).toBeGreaterThanOrEqual(0.10)
  })

  it('1 goal in 1 minute does not clamp personal_attack (minutes-based shrinkage)', () => {
    // With appearances as sample weight: n=1, implied≈169 → clamped to 0.97.
    // With minutes/90 as sample weight: n=1/90≈0.011, n*implied stays ≈constant
    // (totalGoals*goalPts/modelRate), denominator ≈8 → result ≈0.73 — no clamp.
    const result = derivePersonalAttack('FWD', undefined, 0.5, {
      totalGoals: 1, totalAssists: 0, totalMinutes: 1, totalAppearances: 1,
    })
    expect(result).not.toBeNull()
    expect(result!).toBeLessThan(0.97)
    expect(result!).toBeGreaterThan(0.10)
  })

  it('DEF MID gets higher personal_attack than ATK MID for identical stats (lower baseline expectation)', () => {
    // DEF mid model rate is lower → same observed goals/assists look "more impressive"
    // relative to expectation → higher implied multiplier → higher shrunk value.
    const obs = { totalGoals: 3, totalAssists: 2, totalMinutes: 900, totalAppearances: 10 }
    const atk = derivePersonalAttack('MID', 'ATK', 0.6, obs)
    const def = derivePersonalAttack('MID', 'DEF', 0.6, obs)
    expect(atk).not.toBeNull()
    expect(def).not.toBeNull()
    expect(def!).toBeGreaterThan(atk!)
  })

  it('result is always in [0.10, 0.97]', () => {
    const cases: Array<[number, number, number, number]> = [
      [0, 0, 90, 1],
      [5, 2, 450, 5],
      [20, 10, 900, 10],
    ]
    for (const [g, a, min, apps] of cases) {
      const r = derivePersonalAttack('FWD', undefined, 0.7, {
        totalGoals: g, totalAssists: a, totalMinutes: min, totalAppearances: apps,
      })
      if (r !== null) {
        expect(r).toBeGreaterThanOrEqual(0.10)
        expect(r).toBeLessThanOrEqual(0.97)
      }
    }
  })
})
