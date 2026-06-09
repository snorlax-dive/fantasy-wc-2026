import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeChain, createMockSupabase, TEST_USER } from '../helpers/mockSupabase'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

import { createClient } from '@/lib/supabase/server'
import { savePrediction } from '@/app/predictions/actions'

const mockCreateClient = vi.mocked(createClient)

function setup(user: { id: string } | null = TEST_USER) {
  const supabase = createMockSupabase(user)
  mockCreateClient.mockResolvedValue(supabase as never)
  return supabase
}

// Fixture with lock_time in the future
const futureFx = { id: 1, stage: 'GROUP', lock_time: new Date(Date.now() + 86400_000).toISOString(), team_a: 10, team_b: 20 }
const validInput = { fixtureId: 1, predA: 2, predB: 1, scorer1: null, scorer2: null, redCard: false, banker: false }

describe('savePrediction — auth', () => {
  it('not signed in → error', async () => {
    setup(null)
    const result = await savePrediction(validInput)
    expect(result.error).toMatch(/not signed in/i)
  })
})

describe('savePrediction — tournament lock', () => {
  it('tournament_locked=true → error', async () => {
    const db = setup()
    db.from
      .mockReturnValueOnce(makeChain({ data: { value: true } }))  // settings
    const result = await savePrediction(validInput)
    expect(result.error).toMatch(/locked/i)
  })
})

describe('savePrediction — fixture lock', () => {
  it('lock_time in past → locked error', async () => {
    const db = setup()
    const pastFx = { ...futureFx, lock_time: new Date(Date.now() - 3600_000).toISOString() }
    db.from
      .mockReturnValueOnce(makeChain({ data: { value: false } }))  // settings
      .mockReturnValueOnce(makeChain({ data: pastFx }))             // fixture
    const result = await savePrediction(validInput)
    expect(result.error).toMatch(/locked/i)
  })

  it('lock_time in future → proceeds past lock check', async () => {
    const db = setup()
    db.from
      .mockReturnValueOnce(makeChain({ data: { value: false } }))
      .mockReturnValueOnce(makeChain({ data: futureFx }))
      .mockReturnValueOnce(makeChain({ data: null, error: null })) // upsert
    const result = await savePrediction(validInput)
    expect(result.error).toBeUndefined()
    expect(result.ok).toBe(true)
  })
})

describe('savePrediction — score validation', () => {
  function setupHappyPath(db: ReturnType<typeof createMockSupabase>) {
    db.from
      .mockReturnValueOnce(makeChain({ data: { value: false } }))
      .mockReturnValueOnce(makeChain({ data: futureFx }))
  }

  it('predA=null → validation error', async () => {
    const db = setup()
    setupHappyPath(db)
    const result = await savePrediction({ ...validInput, predA: null as never })
    expect(result.error).toBeTruthy()
  })

  it('predA=-1 → validation error', async () => {
    const db = setup()
    setupHappyPath(db)
    const result = await savePrediction({ ...validInput, predA: -1 })
    expect(result.error).toBeTruthy()
  })

  it('predA=100 → validation error', async () => {
    const db = setup()
    setupHappyPath(db)
    const result = await savePrediction({ ...validInput, predA: 100 })
    expect(result.error).toBeTruthy()
  })

  it('predA=0, predB=0 → valid', async () => {
    const db = setup()
    setupHappyPath(db)
    db.from.mockReturnValueOnce(makeChain({ data: null, error: null })) // upsert
    const result = await savePrediction({ ...validInput, predA: 0, predB: 0 })
    expect(result.ok).toBe(true)
  })

  it('predA=5, predB=3 → valid', async () => {
    const db = setup()
    setupHappyPath(db)
    db.from.mockReturnValueOnce(makeChain({ data: null, error: null }))
    const result = await savePrediction({ ...validInput, predA: 5, predB: 3 })
    expect(result.ok).toBe(true)
  })
})

describe('savePrediction — scorer validation', () => {
  function setupToScorers(db: ReturnType<typeof createMockSupabase>) {
    db.from
      .mockReturnValueOnce(makeChain({ data: { value: false } }))
      .mockReturnValueOnce(makeChain({ data: futureFx }))
  }

  it('scorer from wrong team → error', async () => {
    const db = setup()
    setupToScorers(db)
    db.from.mockReturnValueOnce(makeChain({ data: [{ id: 99, team_id: 99 }] })) // players — wrong team
    const result = await savePrediction({ ...validInput, scorer1: 99 })
    expect(result.error).toMatch(/not in this match/i)
  })

  it('scorer from correct team → accepted', async () => {
    const db = setup()
    setupToScorers(db)
    db.from
      .mockReturnValueOnce(makeChain({ data: [{ id: 99, team_id: 10 }] })) // correct team
      .mockReturnValueOnce(makeChain({ data: null, error: null }))          // upsert
    const result = await savePrediction({ ...validInput, scorer1: 99 })
    expect(result.ok).toBe(true)
  })

  it('null scorers → skips scorer validation entirely', async () => {
    const db = setup()
    setupToScorers(db)
    db.from.mockReturnValueOnce(makeChain({ data: null, error: null })) // upsert
    const result = await savePrediction({ ...validInput, scorer1: null, scorer2: null })
    expect(result.ok).toBe(true)
  })
})

describe('savePrediction — banker', () => {
  it('setting banker clears it on other fixtures in same stage', async () => {
    const db = setup()
    db.from
      .mockReturnValueOnce(makeChain({ data: { value: false } }))
      .mockReturnValueOnce(makeChain({ data: futureFx }))
      .mockReturnValueOnce(makeChain({ data: null, error: null }))           // upsert prediction
      .mockReturnValueOnce(makeChain({ data: [{ id: 2 }, { id: 3 }] }))     // stage fixtures
      .mockReturnValueOnce(makeChain({ data: null, error: null }))           // update others is_banker=false

    const result = await savePrediction({ ...validInput, banker: true })
    expect(result.ok).toBe(true)
    // The 5th from() call should have been for the update
    expect(db.from).toHaveBeenCalledTimes(5)
  })
})
