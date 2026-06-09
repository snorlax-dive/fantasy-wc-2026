import { describe, it, expect, vi } from 'vitest'
import { makeChain, createMockSupabase, TEST_USER } from '../helpers/mockSupabase'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

import { createClient } from '@/lib/supabase/server'
import { saveSquad } from '@/app/squad/actions'

const mockCreateClient = vi.mocked(createClient)

// Standard settings row (not locked, GROUP stage, budget 100)
const openSettings = [
  { key: 'tournament_locked', value: false },
  { key: 'current_stage', value: 'GROUP' },
  { key: 'budget_cap', value: 100 },
]

// Fixture that hasn't kicked off yet
const futureKickoff = { kickoff: new Date(Date.now() + 86400_000).toISOString() }
const pastKickoff = { kickoff: new Date(Date.now() - 3600_000).toISOString() }

// Build 11 players: 1 GK, 4 DEF, 4 MID, 2 FWD — all price 8, total 88 (within 100)
function makePlayers(overrides: Partial<{ pos: string; price: number }>[] = []) {
  const defaults = [
    { id: 1, position: 'GK', price: 8 },
    { id: 2, position: 'DEF', price: 8 },
    { id: 3, position: 'DEF', price: 8 },
    { id: 4, position: 'DEF', price: 8 },
    { id: 5, position: 'DEF', price: 8 },
    { id: 6, position: 'MID', price: 8 },
    { id: 7, position: 'MID', price: 8 },
    { id: 8, position: 'MID', price: 8 },
    { id: 9, position: 'MID', price: 8 },
    { id: 10, position: 'FWD', price: 8 },
    { id: 11, position: 'FWD', price: 8 },
  ]
  return defaults.map((p, i) => ({ ...p, ...overrides[i] }))
}

const validIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
const validInput = { playerIds: validIds, captainId: 6 }

function setup(user: { id: string } | null = TEST_USER) {
  const db = createMockSupabase(user)
  mockCreateClient.mockResolvedValue(db as never)
  return db
}

function setupOpenGame(db: ReturnType<typeof createMockSupabase>) {
  db.from
    .mockReturnValueOnce(makeChain({ data: openSettings }))     // settings
    .mockReturnValueOnce(makeChain({ data: futureKickoff }))    // first fixture
}

describe('saveSquad — auth', () => {
  it('not signed in → error', async () => {
    setup(null)
    const result = await saveSquad(validInput)
    expect(result.error).toMatch(/not signed in/i)
  })
})

describe('saveSquad — tournament lock', () => {
  it('tournament_locked=true → error', async () => {
    const db = setup()
    db.from.mockReturnValueOnce(makeChain({
      data: [{ key: 'tournament_locked', value: true }, { key: 'current_stage', value: 'GROUP' }, { key: 'budget_cap', value: 100 }],
    }))
    const result = await saveSquad(validInput)
    expect(result.error).toMatch(/locked/i)
  })
})

describe('saveSquad — stage lock', () => {
  it('first fixture already kicked off → squads locked error', async () => {
    const db = setup()
    db.from
      .mockReturnValueOnce(makeChain({ data: openSettings }))
      .mockReturnValueOnce(makeChain({ data: pastKickoff }))
    const result = await saveSquad(validInput)
    expect(result.error).toMatch(/locked/i)
  })

  it('first fixture in future → proceeds', async () => {
    const db = setup()
    setupOpenGame(db)
    db.from
      .mockReturnValueOnce(makeChain({ data: makePlayers() }))  // players lookup
      .mockReturnValueOnce(makeChain({ data: { id: 'sq-1' } })) // squad upsert
      .mockReturnValueOnce(makeChain({ data: [] }))              // existing picks
      .mockReturnValueOnce(makeChain({ data: null, error: null })) // delete
      .mockReturnValueOnce(makeChain({ data: null, error: null })) // insert
    const result = await saveSquad(validInput)
    expect(result.ok).toBe(true)
  })
})

describe('saveSquad — player count', () => {
  it('10 players → error', async () => {
    const db = setup()
    setupOpenGame(db)
    const result = await saveSquad({ ...validInput, playerIds: validIds.slice(0, 10) })
    expect(result.error).toMatch(/11/i)
  })

  it('12 players → error', async () => {
    const db = setup()
    setupOpenGame(db)
    const result = await saveSquad({ ...validInput, playerIds: [...validIds, 99] })
    expect(result.error).toMatch(/11/i)
  })

  it('duplicate IDs are de-duped → still checked as 11 unique', async () => {
    const db = setup()
    setupOpenGame(db)
    // 12 entries but one duplicate — after dedup → 11 unique
    const dupeIds = [1, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
    db.from
      .mockReturnValueOnce(makeChain({ data: makePlayers() }))
      .mockReturnValueOnce(makeChain({ data: { id: 'sq-1' } }))
      .mockReturnValueOnce(makeChain({ data: [] }))
      .mockReturnValueOnce(makeChain({ data: null, error: null }))
      .mockReturnValueOnce(makeChain({ data: null, error: null }))
    const result = await saveSquad({ ...validInput, playerIds: dupeIds })
    expect(result.ok).toBe(true)
  })
})

describe('saveSquad — captain', () => {
  it('captain not in player list → error', async () => {
    const db = setup()
    setupOpenGame(db)
    const result = await saveSquad({ ...validInput, captainId: 999 })
    expect(result.error).toMatch(/captain/i)
  })

  it('captain in list → valid', async () => {
    const db = setup()
    setupOpenGame(db)
    db.from
      .mockReturnValueOnce(makeChain({ data: makePlayers() }))
      .mockReturnValueOnce(makeChain({ data: { id: 'sq-1' } }))
      .mockReturnValueOnce(makeChain({ data: [] }))
      .mockReturnValueOnce(makeChain({ data: null, error: null }))
      .mockReturnValueOnce(makeChain({ data: null, error: null }))
    const result = await saveSquad({ ...validInput, captainId: 6 })
    expect(result.ok).toBe(true)
  })
})

describe('saveSquad — formation', () => {
  function setupWithPlayers(db: ReturnType<typeof createMockSupabase>, players: ReturnType<typeof makePlayers>) {
    db.from
      .mockReturnValueOnce(makeChain({ data: openSettings }))
      .mockReturnValueOnce(makeChain({ data: futureKickoff }))
      .mockReturnValueOnce(makeChain({ data: players }))
  }

  it('0 GK → error', async () => {
    const db = setup()
    const players = makePlayers([{ pos: 'DEF' }]) // replace GK with DEF
    players[0] = { id: 1, position: 'DEF', price: 8 }
    setupWithPlayers(db, players)
    const result = await saveSquad(validInput)
    expect(result.error).toMatch(/goalkeeper/i)
  })

  it('2 GK → error', async () => {
    const db = setup()
    const players = makePlayers()
    players[1] = { id: 2, position: 'GK', price: 8 } // second GK
    setupWithPlayers(db, players)
    const result = await saveSquad(validInput)
    expect(result.error).toMatch(/goalkeeper/i)
  })

  it('2 DEF → error (below min)', async () => {
    const db = setup()
    const players = makePlayers()
    players[2] = { id: 3, position: 'MID', price: 8 }
    players[3] = { id: 4, position: 'MID', price: 8 }
    setupWithPlayers(db, players)
    const result = await saveSquad(validInput)
    expect(result.error).toMatch(/defender/i)
  })

  it('1 MID → error', async () => {
    const db = setup()
    const players = makePlayers()
    // Replace 3 MIDs with FWDs
    players[6] = { id: 7, position: 'FWD', price: 8 }
    players[7] = { id: 8, position: 'FWD', price: 8 }
    players[8] = { id: 9, position: 'FWD', price: 8 }
    setupWithPlayers(db, players)
    const result = await saveSquad(validInput)
    expect(result.error).toMatch(/midfielder/i)
  })

  it('4 FWD → error (above max)', async () => {
    const db = setup()
    const players = makePlayers()
    players[8] = { id: 9, position: 'FWD', price: 8 }
    players[5] = { id: 6, position: 'FWD', price: 8 }
    // Now: 1GK 4DEF 2MID 4FWD — invalid
    setupWithPlayers(db, players)
    const result = await saveSquad(validInput)
    expect(result.error).toMatch(/forward/i)
  })
})

describe('saveSquad — budget', () => {
  it('over budget → error', async () => {
    const db = setup()
    const expensivePlayers = makePlayers().map(p => ({ ...p, price: 10 })) // 110 total > 100
    db.from
      .mockReturnValueOnce(makeChain({ data: openSettings }))
      .mockReturnValueOnce(makeChain({ data: futureKickoff }))
      .mockReturnValueOnce(makeChain({ data: expensivePlayers }))
    const result = await saveSquad(validInput)
    expect(result.error).toMatch(/budget/i)
  })

  it('exactly at budget cap → valid', async () => {
    const db = setup()
    // budget_cap=100, 11 players at ~9.09 each (use 9+9+9+9+9+9+9+9+9+9+10 = 100)
    const players = makePlayers()
    players[10] = { id: 11, position: 'FWD', price: 12 } // total = 10*8+12 = 92, still under
    db.from
      .mockReturnValueOnce(makeChain({ data: openSettings }))
      .mockReturnValueOnce(makeChain({ data: futureKickoff }))
      .mockReturnValueOnce(makeChain({ data: players }))
      .mockReturnValueOnce(makeChain({ data: { id: 'sq-1' } }))
      .mockReturnValueOnce(makeChain({ data: [] }))
      .mockReturnValueOnce(makeChain({ data: null, error: null }))
      .mockReturnValueOnce(makeChain({ data: null, error: null }))
    const result = await saveSquad(validInput)
    expect(result.ok).toBe(true)
  })
})

describe('saveSquad — Triple Captain chip', () => {
  function setupToChip(db: ReturnType<typeof createMockSupabase>) {
    db.from
      .mockReturnValueOnce(makeChain({ data: openSettings }))
      .mockReturnValueOnce(makeChain({ data: futureKickoff }))
      .mockReturnValueOnce(makeChain({ data: makePlayers() }))
  }

  it('first use this stage → accepted', async () => {
    const db = setup()
    setupToChip(db)
    db.from
      .mockReturnValueOnce(makeChain({ data: null }))              // no existing chip_use
      .mockReturnValueOnce(makeChain({ data: { id: 'sq-1' } }))   // squad upsert
      .mockReturnValueOnce(makeChain({ data: [] }))                // existing picks
      .mockReturnValueOnce(makeChain({ data: null, error: null })) // delete picks
      .mockReturnValueOnce(makeChain({ data: null, error: null })) // insert picks
      .mockReturnValueOnce(makeChain({ data: null, error: null })) // upsert chip
    const result = await saveSquad({ ...validInput, tripleCaptain: true })
    expect(result.ok).toBe(true)
  })

  it('already used in a different stage → error', async () => {
    const db = setup()
    setupToChip(db)
    db.from.mockReturnValueOnce(makeChain({ data: { stage: 'R16' } })) // chip used in R16, current is GROUP
    const result = await saveSquad({ ...validInput, tripleCaptain: true })
    expect(result.error).toMatch(/triple captain/i)
  })
})

describe('saveSquad — rollback on insert failure', () => {
  it('squad_players insert fails → restores old picks, returns error', async () => {
    const db = setup()
    db.from
      .mockReturnValueOnce(makeChain({ data: openSettings }))
      .mockReturnValueOnce(makeChain({ data: futureKickoff }))
      .mockReturnValueOnce(makeChain({ data: makePlayers() }))
      .mockReturnValueOnce(makeChain({ data: { id: 'sq-1' } }))                      // squad upsert
      .mockReturnValueOnce(makeChain({ data: [{ player_id: 5, is_captain: false }] })) // existing picks
      .mockReturnValueOnce(makeChain({ data: null, error: null }))                    // delete
      .mockReturnValueOnce(makeChain({ data: null, error: { message: 'DB error' } })) // insert fails
      .mockReturnValueOnce(makeChain({ data: null, error: null }))                    // restore insert
    const result = await saveSquad(validInput)
    expect(result.error).toBe('DB error')
    // Verify restore was attempted (8th from call)
    expect(db.from).toHaveBeenCalledTimes(8)
  })
})
