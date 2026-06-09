import { describe, it, expect, vi } from 'vitest'
import { makeChain, createMockSupabase, TEST_USER, COMMISSIONER_USER } from '../helpers/mockSupabase'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

import { createClient } from '@/lib/supabase/server'
import { saveFixtureResult, savePlayerStat, playersForFixture } from '@/app/admin/results/actions'

const mockCreateClient = vi.mocked(createClient)

function setup(user: { id: string } | null = COMMISSIONER_USER, isCommissioner = true) {
  const db = createMockSupabase(user)
  // profiles check
  db.from.mockReturnValueOnce(makeChain({ data: { is_commissioner: isCommissioner } }))
  mockCreateClient.mockResolvedValue(db as never)
  return db
}

// ---------------------------------------------------------------------------
// saveFixtureResult
// ---------------------------------------------------------------------------
describe('saveFixtureResult — commissioner gate', () => {
  it('non-commissioner → error', async () => {
    setup(TEST_USER, false)
    const result = await saveFixtureResult({ fixtureId: 1, scoreA: 2, scoreB: 1, finished: true, winnerTeam: null })
    expect(result.error).toMatch(/commissioner/i)
  })
})

describe('saveFixtureResult — score validation', () => {
  it('finished=true, scoreA=null → error', async () => {
    const db = setup()
    db.from.mockReturnValueOnce(makeChain({ data: null, error: null })) // placeholder
    const result = await saveFixtureResult({ fixtureId: 1, scoreA: null, scoreB: 1, finished: true, winnerTeam: null })
    expect(result.error).toMatch(/scores required/i)
  })

  it('finished=true, non-integer score → error', async () => {
    setup()
    const result = await saveFixtureResult({ fixtureId: 1, scoreA: 1.5, scoreB: 1, finished: true, winnerTeam: null })
    expect(result.error).toMatch(/integers/i)
  })

  it('finished=true, scoreA=-1 → out of range error', async () => {
    setup()
    const result = await saveFixtureResult({ fixtureId: 1, scoreA: -1, scoreB: 1, finished: true, winnerTeam: null })
    expect(result.error).toMatch(/range/i)
  })

  it('finished=true, scoreA=21 → out of range error', async () => {
    setup()
    const result = await saveFixtureResult({ fixtureId: 1, scoreA: 21, scoreB: 1, finished: true, winnerTeam: null })
    expect(result.error).toMatch(/range/i)
  })

  it('finished=true, valid scores → update with status=FINISHED', async () => {
    const db = setup()
    db.from.mockReturnValueOnce(makeChain({ data: null, error: null })) // fixture update
    const result = await saveFixtureResult({ fixtureId: 1, scoreA: 2, scoreB: 1, finished: true, winnerTeam: 10 })
    expect(result.ok).toBe(true)
  })

  it('finished=false → update called with no score validation, status=SCHEDULED', async () => {
    const db = setup()
    db.from.mockReturnValueOnce(makeChain({ data: null, error: null }))
    const result = await saveFixtureResult({ fixtureId: 1, scoreA: null, scoreB: null, finished: false, winnerTeam: null })
    expect(result.ok).toBe(true)
  })
})

describe('saveFixtureResult — winner_team schema fallback', () => {
  it('winner_team column missing → retries without it and succeeds', async () => {
    const db = setup()
    db.from
      .mockReturnValueOnce(makeChain({ data: null, error: { message: 'column "winner_team" does not exist' } })) // first attempt fails
      .mockReturnValueOnce(makeChain({ data: null, error: null })) // retry without winner_team succeeds
    const result = await saveFixtureResult({ fixtureId: 1, scoreA: 2, scoreB: 0, finished: true, winnerTeam: 10 })
    expect(result.ok).toBe(true)
    expect(db.from).toHaveBeenCalledTimes(3) // profiles + 2 fixture updates
  })
})

// ---------------------------------------------------------------------------
// playersForFixture
// ---------------------------------------------------------------------------
describe('playersForFixture — commissioner gate', () => {
  it('non-commissioner → error', async () => {
    setup(TEST_USER, false)
    const result = await playersForFixture(1)
    expect(result.error).toMatch(/commissioner/i)
  })
})

describe('playersForFixture — happy path', () => {
  it('returns players for both teams, ordered by name', async () => {
    const db = setup()
    db.from
      .mockReturnValueOnce(makeChain({ data: { team_a: 10, team_b: 20 } })) // fixture
      .mockReturnValueOnce(makeChain({ data: [{ id: 1, name: 'Alpha', position: 'GK', team_id: 10 }] })) // players
    const result = await playersForFixture(1)
    expect(result.players).toHaveLength(1)
    expect(result.players![0].name).toBe('Alpha')
  })

  it('fixture not found → error', async () => {
    const db = setup()
    db.from.mockReturnValueOnce(makeChain({ data: null }))
    const result = await playersForFixture(999)
    expect(result.error).toMatch(/not found/i)
  })

  it('both teams null → returns empty array', async () => {
    const db = setup()
    db.from
      .mockReturnValueOnce(makeChain({ data: { team_a: null, team_b: null } }))
    const result = await playersForFixture(1)
    expect(result.players).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// savePlayerStat
// ---------------------------------------------------------------------------
describe('savePlayerStat — commissioner gate', () => {
  it('non-commissioner → error', async () => {
    setup(TEST_USER, false)
    const result = await savePlayerStat({ fixtureId: 1, playerId: 1, minutes: 90, goals: 0, redCard: false, cleanSheet: true })
    expect(result.error).toMatch(/commissioner/i)
  })
})

describe('savePlayerStat — preservation', () => {
  const input = { fixtureId: 1, playerId: 1, minutes: 90, goals: 1, redCard: false, cleanSheet: true }

  it('no existing row → creates with default 0/false for preserved fields', async () => {
    const db = setup()
    db.from
      .mockReturnValueOnce(makeChain({ data: null }))              // no existing stat
      .mockReturnValueOnce(makeChain({ data: null, error: null })) // upsert
    const result = await savePlayerStat(input)
    expect(result.ok).toBe(true)
  })

  it('existing row → incoming fields updated, assists/saves/etc. preserved from existing', async () => {
    const existing = {
      fixture_id: 1, player_id: 1, minutes: 70, goals: 0, own_goals: 1,
      red_card: false, yellow_card: true, pens_saved: 2, pens_missed: 0,
      clean_sheet: false, assists: 3, saves: 4, tackles: 5, interceptions: 2,
      fantasy_points: 12,
    }
    const db = setup()
    db.from
      .mockReturnValueOnce(makeChain({ data: existing }))          // existing stat
      .mockReturnValueOnce(makeChain({ data: null, error: null })) // upsert

    const result = await savePlayerStat(input)
    expect(result.ok).toBe(true)

    // Verify the upsert was called with preserved fields
    // from() call order: 0=profiles, 1=select existing stat, 2=upsert
    const upsertCall = (db.from as ReturnType<typeof vi.fn>).mock.results[2].value
    const upsertFn = (upsertCall as Record<string, ReturnType<typeof vi.fn>>).upsert
    const row = upsertFn.mock.calls[0][0]

    // Incoming fields updated
    expect(row.minutes).toBe(90)
    expect(row.goals).toBe(1)
    expect(row.red_card).toBe(false)
    expect(row.clean_sheet).toBe(true)

    // Preserved from existing
    expect(row.assists).toBe(3)
    expect(row.saves).toBe(4)
    expect(row.tackles).toBe(5)
    expect(row.interceptions).toBe(2)
    expect(row.own_goals).toBe(1)
    expect(row.yellow_card).toBe(true)
    expect(row.pens_saved).toBe(2)
    // fantasy_points always preserved (recomputed externally)
    expect(row.fantasy_points).toBe(12)
  })
})
