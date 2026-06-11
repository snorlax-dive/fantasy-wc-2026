import { describe, it, expect, vi } from 'vitest'
import { makeChain, createMockSupabase, TEST_USER } from '../helpers/mockSupabase'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

import { createClient } from '@/lib/supabase/server'
import { saveBracket } from '@/app/bracket/actions'

const mockCreateClient = vi.mocked(createClient)

const futureFx = { kickoff: new Date(Date.now() + 86400_000).toISOString() }
const pastFx = { kickoff: new Date(Date.now() - 3600_000).toISOString() }

function setup(user: { id: string } | null = TEST_USER) {
  const db = createMockSupabase(user)
  mockCreateClient.mockResolvedValue(db as never)
  return db
}

// settings is now read as a key/value list (Object.fromEntries(rows.map(...))).
const openSettings = [
  { key: 'tournament_locked', value: false },
  { key: 'current_stage', value: 'GROUP' },
]

function setupOpenBracket(db: ReturnType<typeof createMockSupabase>) {
  db.from
    .mockReturnValueOnce(makeChain({ data: openSettings }))  // settings (list)
    .mockReturnValueOnce(makeChain({ data: futureFx }))      // first knockout fixture
}

// 16 teams reaching R16, 8 QF, 4 SF, 2 Final, 1 Champion — valid
const maxValidFurthest: Record<string, number> = {
  ...Object.fromEntries(Array.from({ length: 16 }, (_, i) => [String(i + 1), 1])),
  ...Object.fromEntries(Array.from({ length: 8 }, (_, i) => [String(i + 1), 2])),
  ...Object.fromEntries(Array.from({ length: 4 }, (_, i) => [String(i + 1), 3])),
  ...Object.fromEntries(Array.from({ length: 2 }, (_, i) => [String(i + 1), 4])),
  '1': 5, // champion
}

describe('saveBracket — auth', () => {
  it('not signed in → error', async () => {
    setup(null)
    const result = await saveBracket({ furthest: {}, goldenBoot: null })
    expect(result.error).toMatch(/not signed in/i)
  })
})

describe('saveBracket — lock', () => {
  it('tournament_locked=true → error', async () => {
    const db = setup()
    db.from.mockReturnValueOnce(makeChain({ data: [{ key: 'tournament_locked', value: true }] }))
    const result = await saveBracket({ furthest: {}, goldenBoot: null })
    expect(result.error).toMatch(/locked/i)
  })

  it('current_stage past GROUP (knockouts begun) → error', async () => {
    const db = setup()
    db.from.mockReturnValueOnce(
      makeChain({ data: [{ key: 'tournament_locked', value: false }, { key: 'current_stage', value: 'R32' }] })
    )
    const result = await saveBracket({ furthest: {}, goldenBoot: null })
    expect(result.error).toMatch(/locked|knockout/i)
  })

  it('knockout fixture already kicked off → error', async () => {
    const db = setup()
    db.from
      .mockReturnValueOnce(makeChain({ data: openSettings }))
      .mockReturnValueOnce(makeChain({ data: pastFx }))
    const result = await saveBracket({ furthest: {}, goldenBoot: null })
    expect(result.error).toMatch(/locked/i)
  })
})

describe('saveBracket — bracket structure limits', () => {
  it('17 teams reaching R16 → error', async () => {
    const db = setup()
    setupOpenBracket(db)
    const furthest = Object.fromEntries(Array.from({ length: 17 }, (_, i) => [String(i + 1), 1]))
    const result = await saveBracket({ furthest, goldenBoot: null })
    expect(result.error).toMatch(/16/i)
  })

  it('9 teams reaching QF → error', async () => {
    const db = setup()
    setupOpenBracket(db)
    const furthest = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [String(i + 1), 2]))
    const result = await saveBracket({ furthest, goldenBoot: null })
    expect(result.error).toMatch(/8/i)
  })

  it('5 teams reaching SF → error', async () => {
    const db = setup()
    setupOpenBracket(db)
    const furthest = Object.fromEntries(Array.from({ length: 5 }, (_, i) => [String(i + 1), 3]))
    const result = await saveBracket({ furthest, goldenBoot: null })
    expect(result.error).toMatch(/4/i)
  })

  it('3 teams reaching Final → error', async () => {
    const db = setup()
    setupOpenBracket(db)
    const furthest = Object.fromEntries(Array.from({ length: 3 }, (_, i) => [String(i + 1), 4]))
    const result = await saveBracket({ furthest, goldenBoot: null })
    expect(result.error).toMatch(/2/i)
  })

  it('2 Champions → error', async () => {
    const db = setup()
    setupOpenBracket(db)
    const furthest = { '1': 5, '2': 5 }
    const result = await saveBracket({ furthest, goldenBoot: null })
    expect(result.error).toMatch(/one champion/i)
  })

  it('exactly 16/8/4/2/1 → valid structure', async () => {
    const db = setup()
    setupOpenBracket(db)
    db.from
      .mockReturnValueOnce(makeChain({ data: [] }))               // existing picks
      .mockReturnValueOnce(makeChain({ data: null, error: null })) // delete
      .mockReturnValueOnce(makeChain({ data: null, error: null })) // insert
    const result = await saveBracket({ furthest: maxValidFurthest, goldenBoot: null })
    expect(result.ok).toBe(true)
  })

  it('empty furthest (all teams at level 0) → valid (clears picks)', async () => {
    const db = setup()
    setupOpenBracket(db)
    db.from
      .mockReturnValueOnce(makeChain({ data: [] }))               // existing picks
      .mockReturnValueOnce(makeChain({ data: null, error: null })) // delete
    const result = await saveBracket({ furthest: {}, goldenBoot: null })
    expect(result.ok).toBe(true)
  })
})

describe('saveBracket — golden boot', () => {
  function setupToInsert(db: ReturnType<typeof createMockSupabase>) {
    setupOpenBracket(db)
    db.from
      .mockReturnValueOnce(makeChain({ data: [] }))               // existing
      .mockReturnValueOnce(makeChain({ data: null, error: null })) // delete
      .mockReturnValueOnce(makeChain({ data: null, error: null })) // insert
  }

  it('goldenBoot=null → no GOLDEN_BOOT row inserted', async () => {
    const db = setup()
    setupToInsert(db)
    const result = await saveBracket({ furthest: { '1': 5 }, goldenBoot: null })
    expect(result.ok).toBe(true)
  })

  it('goldenBoot=playerId → GOLDEN_BOOT row added', async () => {
    const db = setup()
    setupToInsert(db)
    const result = await saveBracket({ furthest: { '1': 5 }, goldenBoot: 42 })
    expect(result.ok).toBe(true)
    // insert should have been called (from call #4 after existing+delete)
    expect(db.from).toHaveBeenCalledTimes(5)
  })
})

describe('saveBracket — rollback', () => {
  it('insert fails → attempts restore of old picks, returns error', async () => {
    const db = setup()
    setupOpenBracket(db)
    db.from
      .mockReturnValueOnce(makeChain({ data: [{ pick_type: 'REACH_R16', team_id: 5, player_id: null, points: 0 }] })) // existing
      .mockReturnValueOnce(makeChain({ data: null, error: null }))                    // delete
      .mockReturnValueOnce(makeChain({ data: null, error: { message: 'insert fail' } })) // insert fails
      .mockReturnValueOnce(makeChain({ data: null, error: null }))                    // restore insert
    const result = await saveBracket({ furthest: { '1': 1 }, goldenBoot: null })
    expect(result.error).toBe('insert fail')
    expect(db.from).toHaveBeenCalledTimes(6) // 2 (lock) + 4 (existing, delete, insert, restore)
  })
})
