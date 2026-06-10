import { describe, it, expect } from 'vitest'
import { projectedPointsPerMatch, projectedPoints, priceFromExpectedPoints, derivePersonalAttack, inferMidRole, mapPosition, startProbFor } from '@/lib/projection'
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

describe('priceFromExpectedPoints — range recalibration', () => {
  it('FWD at 3.4 xPts/match hits top price tier (XPTS_RANGE.FWD.max=3.5)', () => {
    // Old max=3.8: t=(3.4-1.0)/2.8=0.857 → raw≈11.37 → £11.5 (too low for elite FWD)
    // New max=3.5: t=(3.4-1.0)/2.5=0.960 → raw≈12.93 → £13.0
    expect(priceFromExpectedPoints('FWD', 3.4)).toBeGreaterThanOrEqual(13.0)
  })

  it('MID at 3.0 xPts/match no longer near ceiling (XPTS_RANGE.MID.max=3.6)', () => {
    // Old max=3.2: t=(3.0-0.8)/2.4=0.917 → raw≈12.33 → £12.5 (overcrowded at top)
    // New max=3.6: t=(3.0-0.8)/2.8=0.786 → raw≈10.62 → £10.5
    expect(priceFromExpectedPoints('MID', 3.0)).toBeLessThan(12.0)
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
    expect(derivePersonalAttack('GK', 0.8, {
      totalGoals: 2, totalAssists: 1, totalMinutes: 900, totalAppearances: 10,
    })).toBeNull()
  })

  it('returns null for DEF', () => {
    expect(derivePersonalAttack('DEF', 0.8, {
      totalGoals: 1, totalAssists: 2, totalMinutes: 900, totalAppearances: 10,
    })).toBeNull()
  })

  it('returns null when totalMinutes is 0', () => {
    expect(derivePersonalAttack('FWD', 0.8, {
      totalGoals: 0, totalAssists: 0, totalMinutes: 0, totalAppearances: 0,
    })).toBeNull()
  })

  it('elite scorer: result clamped to 0.97', () => {
    // 10 goals in 900 min = 1.0 g/90, far above model rate → implied >> 1.0 → clamps
    const result = derivePersonalAttack('FWD', 0.55, {
      totalGoals: 10, totalAssists: 0, totalMinutes: 900, totalAppearances: 10,
    })
    expect(result).toBe(0.97)
  })

  it('teamAttack floor: zero-scorer on strong team gets personalAttack at teamAttack level', () => {
    // Zero goals/assists shrinks toward 0 → raw shrunk falls below teamAttack.
    // With old floor (0.10): shrunk value returned as-is (below teamAttack)
    // With new floor (teamAttack): returns max(teamAttack, shrunk) = teamAttack
    const result = derivePersonalAttack('FWD', 0.8, {
      totalGoals: 0, totalAssists: 0, totalMinutes: 900, totalAppearances: 10,
    })
    expect(result).not.toBeNull()
    expect(result!).toBeGreaterThanOrEqual(0.8)
    expect(result!).toBeLessThanOrEqual(0.97)
  })

  it('weak-team FWD with above-average qualifier goals: w=16 dampens inflation (Qatar scenario)', () => {
    // 6 goals + 3 assists in 9 game-equivalents → implied ≈ 1.721 (GOAL_PTS[FWD]=4, modelRate=2.13)
    // w=8:  shrunk = (8×0.52 + 9×1.721) / 17  = 1.093 → clamps to 0.97
    // w=15: shrunk = (15×0.52 + 9×1.721) / 24 = 0.970 → clamps to 0.97 (still inflated)
    // w=16: shrunk = (16×0.52 + 9×1.721) / 25 = 0.952 (realistic for a Qatar player)
    // Fixture chosen so w=15 clamps and w=16 does not — locks in the intended prior weight.
    const result = derivePersonalAttack('FWD', 0.52, {
      totalGoals: 6, totalAssists: 3, totalMinutes: 810, totalAppearances: 9,
    })
    expect(result).not.toBeNull()
    expect(result!).toBeLessThan(0.96)
  })

  it('1 goal in 1 minute does not clamp personal_attack (minutes-based shrinkage)', () => {
    // With appearances as sample weight: n=1, implied≈169 → clamped to 0.97.
    // With minutes/90 as sample weight: n=1/90≈0.011, n*implied stays ≈constant
    // (totalGoals*goalPts/modelRate), denominator ≈8 → result ≈0.73 — no clamp.
    const result = derivePersonalAttack('FWD', 0.5, {
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
    const atk = derivePersonalAttack('MID', 0.6, obs, 'ATK')
    const def = derivePersonalAttack('MID', 0.6, obs, 'DEF')
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
      const r = derivePersonalAttack('FWD', 0.7, {
        totalGoals: g, totalAssists: a, totalMinutes: min, totalAppearances: apps,
      })
      if (r !== null) {
        expect(r).toBeGreaterThanOrEqual(0.10)
        expect(r).toBeLessThanOrEqual(0.97)
      }
    }
  })

  it('CONCACAF-style large sample (40 games) is capped: personal_attack stays close to teamAttack', () => {
    // 13 goals + 6 assists in 3600 min (40 games) → implied ≈ 0.82.
    // Without cap (n=40): shrunk ≈ 0.768 (large evidence pulls far from teamAttack=0.50).
    // With cap at MAX_QUALIFIER_MATCHES=10: shrunk ≈ 0.679 (closer to teamAttack).
    const result = derivePersonalAttack('FWD', 0.50, {
      totalGoals: 13, totalAssists: 6, totalMinutes: 3600, totalAppearances: 40,
    })
    expect(result).not.toBeNull()
    // Cap brings result below 0.70; uncapped would give ~0.768
    expect(result!).toBeLessThan(0.70)
  })
})

// ---------------------------------------------------------------------------
// inferMidRole — shirt-number heuristic (no stats)
// ---------------------------------------------------------------------------
describe('inferMidRole — shirt-number heuristic (no stats)', () => {
  it('shirt 8 → ATK', () => expect(inferMidRole(8)).toBe('ATK'))
  it('shirt 9 → ATK', () => expect(inferMidRole(9)).toBe('ATK'))
  it('shirt 10 → ATK', () => expect(inferMidRole(10)).toBe('ATK'))
  it('shirt 11 → ATK', () => expect(inferMidRole(11)).toBe('ATK'))
  it('shirt 7 → DEF (below ATK range)', () => expect(inferMidRole(7)).toBe('DEF'))
  it('shirt 22 → DEF (high number)', () => expect(inferMidRole(22)).toBe('DEF'))
  it('null shirt → DEF', () => expect(inferMidRole(null)).toBe('DEF'))
  it('undefined shirt → DEF', () => expect(inferMidRole(undefined)).toBe('DEF'))
})

// ---------------------------------------------------------------------------
// inferMidRole — qualifier-stats upgrade to ATK
// ---------------------------------------------------------------------------
describe('inferMidRole — qualifier stats upgrade to ATK', () => {
  it('Bellingham-style: shirt #22 with high G+A rate → ATK', () => {
    // 15 combined in 30 games = 0.50/game
    expect(inferMidRole(22, { goals: 9, assists: 6, appearances: 30 })).toBe('ATK')
  })

  it('De Bruyne-style: shirt #7 with high G+A rate → ATK', () => {
    // 20 combined in 35 games = 0.57/game
    expect(inferMidRole(7, { goals: 5, assists: 15, appearances: 35 })).toBe('ATK')
  })

  it('Rodri-style: low G+A rate → DEF despite large sample', () => {
    // 7 combined in 40 games = 0.175/game — below the ATK threshold
    expect(inferMidRole(16, { goals: 3, assists: 4, appearances: 40 })).toBe('DEF')
  })

  it('high G+A rate but fewer than 5 appearances → DEF (insufficient sample)', () => {
    expect(inferMidRole(22, { goals: 3, assists: 3, appearances: 4 })).toBe('DEF')
  })

  it('shirt in ATK range → ATK regardless of zero stats', () => {
    expect(inferMidRole(10, { goals: 0, assists: 0, appearances: 20 })).toBe('ATK')
  })

  it('no qualStats provided → falls back to shirt-number only', () => {
    expect(inferMidRole(22, undefined)).toBe('DEF')
    expect(inferMidRole(10, undefined)).toBe('ATK')
  })
})

// ---------------------------------------------------------------------------
// mapPosition — API-Football position string → internal Pos
// ---------------------------------------------------------------------------
describe('mapPosition — standard API-Football strings', () => {
  it('Goalkeeper → GK', () => expect(mapPosition('Goalkeeper')).toBe('GK'))
  it('Defender → DEF', () => expect(mapPosition('Defender')).toBe('DEF'))
  it('Midfielder → MID', () => expect(mapPosition('Midfielder')).toBe('MID'))
  it('Attacker → FWD', () => expect(mapPosition('Attacker')).toBe('FWD'))
  it('Forward → FWD', () => expect(mapPosition('Forward')).toBe('FWD'))
  it('Striker → FWD', () => expect(mapPosition('Striker')).toBe('FWD'))
})

describe('mapPosition — sub-position strings (regression: previously misclassified)', () => {
  it('Defensive Midfielder → MID (was DEF before fix)', () => expect(mapPosition('Defensive Midfielder')).toBe('MID'))
  it('Attacking Midfielder → MID (was FWD before fix)', () => expect(mapPosition('Attacking Midfielder')).toBe('MID'))
})

describe('mapPosition — edge cases', () => {
  it('null → FWD (catch-all)', () => expect(mapPosition(null)).toBe('FWD'))
  it('undefined → FWD (catch-all)', () => expect(mapPosition(undefined)).toBe('FWD'))
  it('empty string → FWD (catch-all)', () => expect(mapPosition('')).toBe('FWD'))
  it('case-insensitive: "midfielder" → MID', () => expect(mapPosition('midfielder')).toBe('MID'))
  it('case-insensitive: "GOALKEEPER" → GK', () => expect(mapPosition('GOALKEEPER')).toBe('GK'))
})

// ---------------------------------------------------------------------------
// inferMidRole — goal-only ATK fallback (Fix: catches null-assist API data)
// ---------------------------------------------------------------------------
describe('inferMidRole — goal-rate fallback when assists are null', () => {
  it('Bellingham scenario: 2 goals + 0 assists in 12 apps → ATK (goals/app=0.167 ≥ 0.10)', () => {
    // API-Football sometimes returns null assists; goals/app ≥ 0.10 is the fallback
    // Old: (2+0)/12 = 0.167 < 0.20 → DEF. New: goals/app 0.167 ≥ 0.10 → ATK
    expect(inferMidRole(22, { goals: 2, assists: 0, appearances: 12 })).toBe('ATK')
  })

  it('goal rate just below fallback threshold (1 goal in 12 apps) → DEF', () => {
    expect(inferMidRole(22, { goals: 1, assists: 0, appearances: 12 })).toBe('DEF')
  })

  it('G+A threshold still catches assists-rich players (0 goals + 3 assists in 10 apps)', () => {
    // 0/10=0% goals but (0+3)/10=0.30 ≥ 0.20 → ATK via original G+A check
    expect(inferMidRole(22, { goals: 0, assists: 3, appearances: 10 })).toBe('ATK')
  })

  it('goal-only check requires ≥ 5 appearances (same guard as G+A check)', () => {
    expect(inferMidRole(22, { goals: 2, assists: 0, appearances: 4 })).toBe('DEF')
  })
})

// ---------------------------------------------------------------------------
// startProbFor — shirt-number prior with WC floor
// ---------------------------------------------------------------------------
describe('startProbFor — shirt-number prior', () => {
  it('shirt #1 → high prior (GK, well above floor)', () => {
    expect(startProbFor(730, 1)).toBeGreaterThanOrEqual(0.65)
  })

  it('shirt #9 → prior in sensible range [0.40, 0.90]', () => {
    const p = startProbFor(1100, 9) // Haaland's API id
    expect(p).toBeGreaterThanOrEqual(0.40)
    expect(p).toBeLessThanOrEqual(0.90)
  })

  it('shirt #22 never falls below 0.40 floor regardless of hash', () => {
    // Bellingham (#22 England) had prior 0.269 before fix — far too low for a WC starter
    // Test multiple API IDs to cover the hash distribution
    for (const id of [129718, 1, 999999, 50000, 200000]) {
      expect(startProbFor(id, 22)).toBeGreaterThanOrEqual(0.40)
    }
  })

  it('shirt #26 → floor holds at extreme high shirt numbers', () => {
    for (const id of [386828, 99999, 777777]) {
      expect(startProbFor(id, 26)).toBeGreaterThanOrEqual(0.40)
    }
  })

  it('lower shirt → same or higher prior (monotonic above floor)', () => {
    // Shirt #5 should be ≥ shirt #20 for the same player ID
    expect(startProbFor(1000, 5)).toBeGreaterThanOrEqual(startProbFor(1000, 20))
  })

  it('null/undefined shirt → default prior ≥ 0.40', () => {
    expect(startProbFor(12345, null)).toBeGreaterThanOrEqual(0.40)
    expect(startProbFor(12345, undefined)).toBeGreaterThanOrEqual(0.40)
  })
})
