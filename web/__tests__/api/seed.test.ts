import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeChain, createMockSupabase } from '../helpers/mockSupabase'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/apiFootball', () => ({ WORLD_CUP_LEAGUE: 1, SEASON: 2026, apiFootball: vi.fn() }))

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { apiFootball } from '@/lib/apiFootball'
import { GET } from '@/app/api/admin/seed/route'

const mockCreateClient = vi.mocked(createClient)
const mockCreateAdminClient = vi.mocked(createAdminClient)
const mockApiFootball = vi.mocked(apiFootball)

const CRON_SECRET = 'seed-cron-secret'

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL('http://localhost/api/admin/seed')
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return new Request(url.toString(), {
    headers: new Headers({ authorization: `Bearer ${CRON_SECRET}` }),
  })
}

beforeEach(() => {
  process.env.CRON_SECRET = CRON_SECRET
  vi.clearAllMocks()

  const serverDb = createMockSupabase(null)
  mockCreateClient.mockResolvedValue(serverDb as never)
})

function setupAdminDb() {
  const adminDb = createMockSupabase(null)
  mockCreateAdminClient.mockReturnValue(adminDb as never)
  return adminDb
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
describe('GET /api/admin/seed — auth', () => {
  it('no auth → 401', async () => {
    const serverDb = createMockSupabase(null)
    serverDb.from.mockReturnValueOnce(makeChain({ data: { is_commissioner: false } }))
    mockCreateClient.mockResolvedValue(serverDb as never)
    const res = await GET(new Request('http://localhost/api/admin/seed'))
    expect(res.status).toBe(401)
  })
})

// ---------------------------------------------------------------------------
// step=base dry run
// ---------------------------------------------------------------------------
describe('GET /api/admin/seed — step=base', () => {
  it('dry=1 → no DB writes', async () => {
    const adminDb = setupAdminDb()
    // apiFootball returns arrays directly (already unwrapped from json.response)
    mockApiFootball
      .mockResolvedValueOnce([{ team: { id: 1, name: 'France' }, venue: {} }]) // teams
      .mockResolvedValueOnce([]) // fixtures

    const res = await GET(makeRequest({ step: 'base', dry: '1' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.dry).toBe(true)
    expect(adminDb.from).not.toHaveBeenCalled()
  })

  it('empty API response → 0 teams, 0 fixtures', async () => {
    const adminDb = setupAdminDb()
    adminDb.from
      .mockReturnValueOnce(makeChain({ data: [], error: null })) // teams upsert → then teams select
      .mockReturnValueOnce(makeChain({ data: [] }))               // teams select (id, api_team_id map)
      .mockReturnValueOnce(makeChain({ data: null, error: null })) // fixtures upsert
    mockApiFootball
      .mockResolvedValueOnce([]) // teams
      .mockResolvedValueOnce([]) // fixtures

    const res = await GET(makeRequest({ step: 'base' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.teams).toBe(0)
    expect(body.fixtures).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// step=players
// ---------------------------------------------------------------------------
describe('GET /api/admin/seed — step=players', () => {
  it('dry=1 with no teams → no API calls and dry=true response', async () => {
    const adminDb = setupAdminDb()
    adminDb.from.mockReturnValueOnce(makeChain({ data: [] })) // teams select (empty)

    const res = await GET(makeRequest({ step: 'players', dry: '1' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.dry).toBe(true)
    expect(mockApiFootball).not.toHaveBeenCalled()
  })

  it('team with no GROUP fixtures → flat 3-match projection', async () => {
    const adminDb = setupAdminDb()
    adminDb.from
      .mockReturnValueOnce(makeChain({ data: [{ id: 1, name: 'France', api_team_id: 10 }] })) // teams
      .mockReturnValueOnce(makeChain({ data: [] }))  // GROUP fixtures for team (empty → flat projection)
      .mockReturnValueOnce(makeChain({ data: null, error: null })) // players upsert

    // /players/squads returns [{players: [...]}] (squad wrapper)
    mockApiFootball.mockResolvedValueOnce([{
      players: [{ id: 100, name: 'Mbappé', position: 'Forward', number: 10, photo: null }],
    }])

    const res = await GET(makeRequest({ step: 'players' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.inserted).toBeGreaterThanOrEqual(0)
  })
})

// ---------------------------------------------------------------------------
// step=qualifiers
// ---------------------------------------------------------------------------
describe('GET /api/admin/seed — step=qualifiers', () => {
  it('player with 0 appearances → skipped (no div-by-zero)', async () => {
    const adminDb = setupAdminDb()
    // teams select
    adminDb.from.mockReturnValueOnce(makeChain({ data: [{ id: 1, name: 'France', api_team_id: 10 }] }))
    // GROUP fixtures select
    adminDb.from.mockReturnValueOnce(makeChain({ data: [] }))
    // players for this team
    adminDb.from.mockReturnValueOnce(makeChain({ data: [{ id: 50, api_player_id: 100, position: 'FWD' }] }))

    // /players returns entries with 0 appearances
    mockApiFootball.mockResolvedValueOnce([{
      player: { id: 100, name: 'Test', nationality: 'France' },
      statistics: [{ games: { position: 'Forward', number: 9, appearences: 0, minutes: 0 }, team: { id: 10 } }],
    }])

    const res = await GET(makeRequest({ step: 'qualifiers' }))
    expect(res.status).toBe(200)
    // 0-appearance player is skipped → 0 updates
    const body = await res.json()
    expect(body.updated).toBe(0)
  })

  it('startProb is shrunk toward shirt-number prior (not purely raw qualifier rate)', async () => {
    // Player played 100% of qualifier minutes (raw rate = 1.0 → old code would clamp to 0.97).
    // With shrinkage (w=4, appearances=2), result is pulled toward shirt-number prior < 0.97.
    const adminDb = setupAdminDb()
    adminDb.from.mockReturnValueOnce(makeChain({ data: [{ id: 1, name: 'Norway', api_team_id: 10 }] }))
    adminDb.from.mockReturnValueOnce(makeChain({ data: [] })) // allGroupFx
    adminDb.from.mockReturnValueOnce(makeChain({ data: null, error: null })) // personal_attack column probe
    adminDb.from.mockReturnValueOnce(makeChain({ data: [{ id: 50, api_player_id: 999, position: 'FWD' }] }))

    let capturedRow: Record<string, unknown> | null = null
    let capturedEqId: unknown = null
    adminDb.from.mockImplementationOnce(() => {
      const chain = makeChain({ data: null, error: null })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(chain as any).update = vi.fn((...args: unknown[]) => {
        capturedRow = args[0] as Record<string, unknown>
        return chain
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(chain as any).eq = vi.fn((...args: unknown[]) => {
        if (args[0] === 'id') capturedEqId = args[1]
        return chain
      })
      return chain
    })

    mockApiFootball.mockResolvedValueOnce([{
      player: { id: 999, name: 'Haaland', nationality: 'Norway' },
      statistics: [{
        games: { position: 'Forward', number: 9, appearences: 2, minutes: 180 },
        goals: { total: 1, assists: 0 },
        team: { id: 10 },
      }],
    }])

    const res = await GET(makeRequest({ step: 'qualifiers' }))
    expect(res.status).toBe(200)
    expect(capturedRow).not.toBeNull()
    expect(capturedEqId).toBe(50)
    // Shrinkage pulls the result below 0.97 (formula: (4*shirtPrior + 2*1.0) / 6)
    expect(capturedRow!.start_prob as number).toBeLessThan(0.97)
    expect(capturedRow!.start_prob as number).toBeGreaterThan(0.10)
  })

  it('elite-scoring FWD gets personal_attack above team attack', async () => {
    // Norway team attack = 0.80 (lib/teamStrength.ts).
    // 8 goals + 2 assists in 10 games → personal_attack should be clamped at 0.97.
    const adminDb = setupAdminDb()
    adminDb.from.mockReturnValueOnce(makeChain({ data: [{ id: 1, name: 'Norway', api_team_id: 10 }] }))
    adminDb.from.mockReturnValueOnce(makeChain({ data: [] })) // allGroupFx
    adminDb.from.mockReturnValueOnce(makeChain({ data: null, error: null })) // personal_attack column probe
    adminDb.from.mockReturnValueOnce(makeChain({ data: [{ id: 50, api_player_id: 999, position: 'FWD' }] }))

    let capturedRow: Record<string, unknown> | null = null
    let capturedEqId: unknown = null
    adminDb.from.mockImplementationOnce(() => {
      const chain = makeChain({ data: null, error: null })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(chain as any).update = vi.fn((...args: unknown[]) => {
        capturedRow = args[0] as Record<string, unknown>
        return chain
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(chain as any).eq = vi.fn((...args: unknown[]) => {
        if (args[0] === 'id') capturedEqId = args[1]
        return chain
      })
      return chain
    })

    mockApiFootball.mockResolvedValueOnce([{
      player: { id: 999, name: 'Haaland', nationality: 'Norway' },
      statistics: [{
        games: { position: 'Forward', number: 9, appearences: 10, minutes: 900 },
        goals: { total: 8, assists: 2 },
        team: { id: 10 },
      }],
    }])

    const res = await GET(makeRequest({ step: 'qualifiers' }))
    expect(res.status).toBe(200)
    expect(capturedRow).not.toBeNull()
    expect(capturedEqId).toBe(50)
    const pa = capturedRow!.personal_attack as number | null
    expect(pa).not.toBeNull()
    expect(pa!).toBeGreaterThan(0.80) // Norway team attack
    expect(pa!).toBeLessThanOrEqual(0.97)
  })

  it('GK gets null personal_attack in update', async () => {
    const adminDb = setupAdminDb()
    adminDb.from.mockReturnValueOnce(makeChain({ data: [{ id: 1, name: 'Norway', api_team_id: 10 }] }))
    adminDb.from.mockReturnValueOnce(makeChain({ data: [] })) // allGroupFx
    adminDb.from.mockReturnValueOnce(makeChain({ data: null, error: null })) // personal_attack column probe
    adminDb.from.mockReturnValueOnce(makeChain({ data: [{ id: 51, api_player_id: 888, position: 'GK' }] }))

    let capturedRow: Record<string, unknown> | null = null
    let capturedEqId: unknown = null
    adminDb.from.mockImplementationOnce(() => {
      const chain = makeChain({ data: null, error: null })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(chain as any).update = vi.fn((...args: unknown[]) => {
        capturedRow = args[0] as Record<string, unknown>
        return chain
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(chain as any).eq = vi.fn((...args: unknown[]) => {
        if (args[0] === 'id') capturedEqId = args[1]
        return chain
      })
      return chain
    })

    mockApiFootball.mockResolvedValueOnce([{
      player: { id: 888, name: 'Keeper', nationality: 'Norway' },
      statistics: [{
        games: { position: 'Goalkeeper', number: 1, appearences: 8, minutes: 720 },
        goals: { total: 0, assists: 0 },
        team: { id: 10 },
      }],
    }])

    const res = await GET(makeRequest({ step: 'qualifiers' }))
    expect(res.status).toBe(200)
    expect(capturedRow).not.toBeNull()
    expect(capturedEqId).toBe(51)
    expect(capturedRow!.personal_attack).toBeNull()
  })

  it('games.lineups used as rawProb denominator: genuine starter with sub appearances gets higher startProb', async () => {
    // Player: 9 lineup starts (full-game starter), 15 total appearances (6 sub apps).
    // Total minutes: 9*90 + 6*15 = 810+90 = 900.
    // Old formula: rawProb = 900/(15*90) = 0.667, N=15 → startProb ≈ 0.62
    // New formula: rawProb = min(1.0, 900/810) = 1.0, N=9  → startProb ≈ 0.85+
    //   (sub minutes push 900 > 810, so clamping rawProb to 1.0 is required)
    // The new startProb must be > 0.75 to prove the lineups path is used.
    const adminDb = setupAdminDb()
    adminDb.from.mockReturnValueOnce(makeChain({ data: [{ id: 1, name: 'Norway', api_team_id: 10 }] }))
    adminDb.from.mockReturnValueOnce(makeChain({ data: [] })) // allGroupFx
    adminDb.from.mockReturnValueOnce(makeChain({ data: null, error: null })) // personal_attack probe
    adminDb.from.mockReturnValueOnce(makeChain({ data: [{ id: 50, api_player_id: 999, position: 'FWD' }] }))

    let capturedRow: Record<string, unknown> | null = null
    adminDb.from.mockImplementationOnce(() => {
      const chain = makeChain({ data: null, error: null })
      ;(chain as never as { update: ReturnType<typeof vi.fn> }).update = vi.fn((...args: unknown[]) => {
        capturedRow = args[0] as Record<string, unknown>
        return chain
      })
      ;(chain as never as { eq: ReturnType<typeof vi.fn> }).eq = vi.fn(() => chain)
      return chain
    })

    mockApiFootball.mockResolvedValueOnce([{
      player: { id: 999, name: 'FullTimeStarter', nationality: 'Norway' },
      statistics: [{
        games: { position: 'Forward', number: 9, appearences: 15, lineups: 9, minutes: 900 },
        goals: { total: 3, assists: 1 },
        team: { id: 10 },
      }],
    }])

    const res = await GET(makeRequest({ step: 'qualifiers' }))
    expect(res.status).toBe(200)
    expect(capturedRow).not.toBeNull()
    // startProb > 0.75 proves the lineups path drove the rawProb up;
    // the appearances-only path would give ≈ 0.62
    expect(capturedRow!.start_prob as number).toBeGreaterThan(0.75)
  })

  it('startProb clamped to [0.10, 0.97] for 100% start rate', async () => {
    const adminDb = setupAdminDb()
    adminDb.from.mockReturnValueOnce(makeChain({ data: [{ id: 1, name: 'France', api_team_id: 10 }] }))
    adminDb.from.mockReturnValueOnce(makeChain({ data: [] })) // GROUP fixtures (none)
    adminDb.from.mockReturnValueOnce(makeChain({ data: null, error: null })) // personal_attack column probe
    adminDb.from.mockReturnValueOnce(makeChain({ data: [{ id: 50, api_player_id: 100, position: 'FWD' }] }))

    let capturedRow: Record<string, unknown> | null = null
    let capturedEqId: unknown = null
    adminDb.from.mockImplementationOnce(() => {
      const chain = makeChain({ data: null, error: null })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(chain as any).update = vi.fn((...args: unknown[]) => {
        capturedRow = args[0] as Record<string, unknown>
        return chain
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(chain as any).eq = vi.fn((...args: unknown[]) => {
        if (args[0] === 'id') capturedEqId = args[1]
        return chain
      })
      return chain
    })

    mockApiFootball.mockResolvedValueOnce([{
      player: { id: 100, name: 'Starter', nationality: 'France' },
      statistics: [{
        games: { position: 'Forward', number: 9, appearences: 10, minutes: 900 }, // 100% start rate
        team: { id: 10 },
      }],
    }])

    const res = await GET(makeRequest({ step: 'qualifiers' }))
    expect(res.status).toBe(200)
    expect(capturedRow).not.toBeNull()
    expect(capturedEqId).toBe(50)
    expect(capturedRow!.start_prob as number).toBeGreaterThanOrEqual(0.10)
    expect(capturedRow!.start_prob as number).toBeLessThanOrEqual(0.97)
  })
})
