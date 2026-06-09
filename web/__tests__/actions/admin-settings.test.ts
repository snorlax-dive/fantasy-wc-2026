import { describe, it, expect, vi } from 'vitest'
import { makeChain, createMockSupabase, TEST_USER, COMMISSIONER_USER } from '../helpers/mockSupabase'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

import { createClient } from '@/lib/supabase/server'
import { setStage, setTournamentLock, setSignupsOpen } from '@/app/admin/actions'

const mockCreateClient = vi.mocked(createClient)

function setup(user: { id: string } | null = COMMISSIONER_USER, isCommissioner = true) {
  const db = createMockSupabase(user)
  db.from.mockReturnValueOnce(makeChain({ data: { is_commissioner: isCommissioner } }))
  mockCreateClient.mockResolvedValue(db as never)
  return db
}

// ---------------------------------------------------------------------------
// setSignupsOpen
// ---------------------------------------------------------------------------
describe('setSignupsOpen — commissioner gate', () => {
  it('non-commissioner → error', async () => {
    setup(TEST_USER, false)
    const result = await setSignupsOpen(true)
    expect(result.error).toMatch(/commissioner/i)
  })
})

describe('setSignupsOpen — happy path', () => {
  it('open=true → updates settings', async () => {
    const db = setup()
    db.from.mockReturnValueOnce(makeChain({ data: null, error: null }))
    const result = await setSignupsOpen(true)
    expect(result.ok).toBe(true)
  })

  it('open=false → updates settings', async () => {
    const db = setup()
    db.from.mockReturnValueOnce(makeChain({ data: null, error: null }))
    const result = await setSignupsOpen(false)
    expect(result.ok).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// setTournamentLock
// ---------------------------------------------------------------------------
describe('setTournamentLock — commissioner gate', () => {
  it('non-commissioner → error', async () => {
    setup(TEST_USER, false)
    const result = await setTournamentLock(true)
    expect(result.error).toMatch(/commissioner/i)
  })
})

describe('setTournamentLock — happy path', () => {
  it('locked=true → updates settings', async () => {
    const db = setup()
    db.from.mockReturnValueOnce(makeChain({ data: null, error: null }))
    const result = await setTournamentLock(true)
    expect(result.ok).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// setStage
// ---------------------------------------------------------------------------
describe('setStage — validation', () => {
  it('invalid stage name → error (no DB call)', async () => {
    setup()
    const result = await setStage('INVALID')
    expect(result.error).toMatch(/invalid stage/i)
  })
})

describe('setStage — commissioner gate', () => {
  it('non-commissioner → error', async () => {
    setup(TEST_USER, false)
    const result = await setStage('R16')
    expect(result.error).toMatch(/commissioner/i)
  })
})

describe('setStage — happy path', () => {
  for (const stage of ['GROUP', 'R32', 'R16', 'QF', 'SF', 'FINAL']) {
    it(`stage=${stage} → updates settings + snapshots standings`, async () => {
      const db = setup()
      db.from.mockReturnValueOnce(makeChain({ data: null, error: null })) // current_stage update
      // Standings snapshot (best-effort, non-fatal)
      db.rpc.mockResolvedValueOnce({ data: [{ user_id: 'u1' }, { user_id: 'u2' }], error: null })
      db.from
        .mockReturnValueOnce(makeChain({ data: null, error: null })) // standings_baseline upsert
        .mockReturnValueOnce(makeChain({ data: null, error: null })) // standings_baseline_stage upsert
      const result = await setStage(stage)
      expect(result.ok).toBe(true)
    })
  }
})
