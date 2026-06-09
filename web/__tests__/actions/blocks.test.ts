import { describe, it, expect, vi } from 'vitest'
import { makeChain, createMockSupabase, TEST_USER } from '../helpers/mockSupabase'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { saveBlock, setShield } from '@/app/blocks/actions'

const mockCreateClient = vi.mocked(createClient)
const mockCreateAdminClient = vi.mocked(createAdminClient)

// Settings for a KO stage that is NOT locked
const koOpenSettings = [
  { key: 'current_stage', value: 'R16' },
  { key: 'shields_per_user', value: 2 },
]
const futureKickoff = { kickoff: new Date(Date.now() + 86400_000).toISOString() }

function setup(user: { id: string } | null = TEST_USER) {
  const db = createMockSupabase(user)
  mockCreateClient.mockResolvedValue(db as never)
  const adminDb = createMockSupabase(user)
  mockCreateAdminClient.mockReturnValue(adminDb as never)
  return { db, adminDb }
}

// Returns the stageContext mock chain calls
function setupKOOpen(db: ReturnType<typeof createMockSupabase>) {
  db.from
    .mockReturnValueOnce(makeChain({ data: koOpenSettings })) // settings
    .mockReturnValueOnce(makeChain({ data: futureKickoff }))  // first fixture
}

// ---------------------------------------------------------------------------
// saveBlock
// ---------------------------------------------------------------------------
describe('saveBlock — auth', () => {
  it('not signed in → error', async () => {
    setup(null)
    const result = await saveBlock({ targetUserId: 'other', playerId: 1 })
    expect(result.error).toMatch(/not signed in/i)
  })
})

describe('saveBlock — GROUP stage', () => {
  it('GROUP stage → blocks not available error', async () => {
    const { db } = setup()
    db.from
      .mockReturnValueOnce(makeChain({ data: [{ key: 'current_stage', value: 'GROUP' }, { key: 'shields_per_user', value: 2 }] }))
      .mockReturnValueOnce(makeChain({ data: futureKickoff }))
    const result = await saveBlock({ targetUserId: 'other', playerId: 1 })
    expect(result.error).toMatch(/blocks open/i)
  })
})

describe('saveBlock — locked', () => {
  it('tournament_locked=true in settings → locked error', async () => {
    const { db } = setup()
    db.from
      .mockReturnValueOnce(makeChain({ data: [{ key: 'current_stage', value: 'R16' }, { key: 'shields_per_user', value: 2 }, { key: 'tournament_locked', value: true }] }))
      .mockReturnValueOnce(makeChain({ data: futureKickoff }))
    const result = await saveBlock({ targetUserId: 'other', playerId: 1 })
    expect(result.error).toMatch(/locked/i)
  })

  it('first fixture kicked off → locked error', async () => {
    const { db } = setup()
    db.from
      .mockReturnValueOnce(makeChain({ data: koOpenSettings }))
      .mockReturnValueOnce(makeChain({ data: { kickoff: new Date(Date.now() - 3600_000).toISOString() } }))
    const result = await saveBlock({ targetUserId: 'other', playerId: 1 })
    expect(result.error).toMatch(/locked/i)
  })
})

describe('saveBlock — self-targeting', () => {
  it('targeting own userId → error', async () => {
    const { db } = setup()
    setupKOOpen(db)
    const result = await saveBlock({ targetUserId: TEST_USER.id, playerId: 1 })
    expect(result.error).toMatch(/yourself/i)
  })
})

describe('saveBlock — target has no squad', () => {
  it('target user has no squad this round → error', async () => {
    const { db, adminDb } = setup()
    setupKOOpen(db)
    adminDb.from.mockReturnValueOnce(makeChain({ data: null })) // no squad
    const result = await saveBlock({ targetUserId: 'other-user', playerId: 1 })
    expect(result.error).toMatch(/no squad/i)
  })
})

describe('saveBlock — player not found', () => {
  it('player does not exist → error', async () => {
    const { db, adminDb } = setup()
    setupKOOpen(db)
    adminDb.from.mockReturnValueOnce(makeChain({ data: { id: 'sq-1' } })) // target has squad
    db.from.mockReturnValueOnce(makeChain({ data: null })) // player not found
    const result = await saveBlock({ targetUserId: 'other-user', playerId: 999 })
    expect(result.error).toMatch(/player/i)
  })
})

describe('saveBlock — valid block', () => {
  it('places block with revealed=false', async () => {
    const { db, adminDb } = setup()
    setupKOOpen(db)
    adminDb.from.mockReturnValueOnce(makeChain({ data: { id: 'sq-1' } }))
    db.from
      .mockReturnValueOnce(makeChain({ data: { id: 1 } }))           // player exists
      .mockReturnValueOnce(makeChain({ data: null, error: null }))    // upsert block
    const result = await saveBlock({ targetUserId: 'other-user', playerId: 1 })
    expect(result.ok).toBe(true)
  })

  it('null targetUserId → deletes existing block', async () => {
    const { db } = setup()
    setupKOOpen(db)
    db.from.mockReturnValueOnce(makeChain({ data: null, error: null })) // delete
    const result = await saveBlock({ targetUserId: null, playerId: null })
    expect(result.ok).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// setShield
// ---------------------------------------------------------------------------
describe('setShield — auth & stage guards', () => {
  it('not signed in → error', async () => {
    setup(null)
    const result = await setShield({ use: true })
    expect(result.error).toMatch(/not signed in/i)
  })

  it('GROUP stage → error', async () => {
    const { db } = setup()
    db.from
      .mockReturnValueOnce(makeChain({ data: [{ key: 'current_stage', value: 'GROUP' }, { key: 'shields_per_user', value: 2 }] }))
      .mockReturnValueOnce(makeChain({ data: futureKickoff }))
    const result = await setShield({ use: true })
    expect(result.error).toMatch(/knockout/i)
  })
})

describe('setShield — use=true', () => {
  function setupKOForShield(db: ReturnType<typeof createMockSupabase>) {
    db.from
      .mockReturnValueOnce(makeChain({ data: koOpenSettings }))
      .mockReturnValueOnce(makeChain({ data: futureKickoff }))
  }

  it('no shields used yet → upsert succeeds', async () => {
    const { db } = setup()
    setupKOForShield(db)
    db.from
      .mockReturnValueOnce(makeChain({ data: null }))              // not used this stage
      .mockReturnValueOnce(makeChain({ data: null, count: 0 }))   // global count = 0
      .mockReturnValueOnce(makeChain({ data: null, error: null })) // upsert
    const result = await setShield({ use: true })
    expect(result.ok).toBe(true)
  })

  it('already used in this stage → idempotent (no error)', async () => {
    const { db } = setup()
    setupKOForShield(db)
    db.from
      .mockReturnValueOnce(makeChain({ data: { id: 'existing' } })) // already used this stage
      .mockReturnValueOnce(makeChain({ data: null, error: null }))   // upsert
    const result = await setShield({ use: true })
    expect(result.ok).toBe(true)
  })

  it('global limit reached → error', async () => {
    const { db } = setup()
    setupKOForShield(db)
    db.from
      .mockReturnValueOnce(makeChain({ data: null }))              // not used this stage
      .mockReturnValueOnce(makeChain({ data: null, count: 2 }))   // global count = 2 (at limit)
    const result = await setShield({ use: true })
    expect(result.error).toMatch(/no shields left/i)
  })
})

describe('setShield — use=false', () => {
  it('deletes shield_use for user+stage', async () => {
    const { db } = setup()
    db.from
      .mockReturnValueOnce(makeChain({ data: koOpenSettings }))
      .mockReturnValueOnce(makeChain({ data: futureKickoff }))
      .mockReturnValueOnce(makeChain({ data: null, error: null })) // delete
    const result = await setShield({ use: false })
    expect(result.ok).toBe(true)
  })
})
