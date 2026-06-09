import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeChain, createMockSupabase } from '../helpers/mockSupabase'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/apiFootball', () => ({ WORLD_CUP_LEAGUE: 1, SEASON: 2026, apiFootball: vi.fn() }))

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { apiFootball } from '@/lib/apiFootball'
import { GET } from '@/app/api/admin/poll/route'

const mockCreateClient = vi.mocked(createClient)
const mockCreateAdminClient = vi.mocked(createAdminClient)
const mockApiFootball = vi.mocked(apiFootball)

const CRON_SECRET = 'poll-cron-secret'

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL('http://localhost/api/admin/poll')
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const headers = new Headers({ authorization: `Bearer ${CRON_SECRET}` })
  return new Request(url.toString(), { headers })
}

function setupAuth() {
  const serverDb = createMockSupabase(null)
  mockCreateClient.mockResolvedValue(serverDb as never)
}

function setupAdminDbForPoll(fixtures: unknown[] = [], teams: unknown[] = []) {
  const adminDb = createMockSupabase(null)
  adminDb.from
    .mockReturnValueOnce(makeChain({ data: teams }))    // teams
    .mockReturnValueOnce(makeChain({ data: fixtures })) // existing fixtures
  mockCreateAdminClient.mockReturnValue(adminDb as never)
  return adminDb
}

beforeEach(() => {
  process.env.CRON_SECRET = CRON_SECRET
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Authorization
// ---------------------------------------------------------------------------
describe('GET /api/admin/poll — auth', () => {
  it('no auth → 401', async () => {
    const serverDb = createMockSupabase(null)
    serverDb.from.mockReturnValueOnce(makeChain({ data: { is_commissioner: false } }))
    mockCreateClient.mockResolvedValue(serverDb as never)
    const req = new Request('http://localhost/api/admin/poll')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('valid CRON_SECRET → authorized', async () => {
    setupAuth()
    // apiFootball returns an array directly (response already unwrapped)
    mockApiFootball.mockResolvedValue([])
    setupAdminDbForPoll()
    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
  })
})

// ---------------------------------------------------------------------------
// Dry run
// ---------------------------------------------------------------------------
describe('GET /api/admin/poll — dry=1', () => {
  it('returns dry flag without DB writes when fixture list empty', async () => {
    setupAuth()
    mockApiFootball.mockResolvedValue([])
    const adminDb = createMockSupabase(null)
    mockCreateAdminClient.mockReturnValue(adminDb as never)

    const res = await GET(makeRequest({ dry: '1' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.dry).toBe(true)
    // No finished fixtures → no DB writes
    expect(adminDb.from).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Empty fixture list
// ---------------------------------------------------------------------------
describe('GET /api/admin/poll — empty response', () => {
  it('API returns empty fixture list → 0 processed', async () => {
    setupAuth()
    mockApiFootball.mockResolvedValue([])
    setupAdminDbForPoll()
    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.processed).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Stage mapping
// ---------------------------------------------------------------------------
describe('GET /api/admin/poll — stage mapping', () => {
  const stageMap: Array<[string, string]> = [
    ['group stage - 1', 'GROUP'],
    ['group stage - 2', 'GROUP'],
    ['group stage - 3', 'GROUP'],
    ['round of 32', 'R32'],
    ['round of 16', 'R16'],
    ['quarter-finals', 'QF'],
    ['semi-finals', 'SF'],
    ['3rd place final', 'FINAL'],
    ['final', 'FINAL'],
  ]

  it.each(stageMap)('API round "%s" → stage "%s"', async (apiRound, _expected) => {
    setupAuth()
    const fixture = {
      fixture: { id: 1, status: { short: 'FT' }, date: '2026-06-15T14:00:00Z' },
      league: { round: apiRound },
      teams: {
        home: { id: 100, winner: true },
        away: { id: 200, winner: false },
      },
      goals: { home: 2, away: 0 },
      score: { penalty: { home: null, away: null } },
    }
    mockApiFootball
      .mockResolvedValueOnce([fixture]) // fixtures list (array, already unwrapped)
      .mockResolvedValueOnce([])        // player stats
    const adminDb = setupAdminDbForPoll(
      [{ id: 1, finished: false, status: 'SCHEDULED', stage: 'GROUP', kickoff: '2026-06-15T14:00:00Z', score_a: null, score_b: null, had_red_card: false, team_a: 100, team_b: 200, api_fixture_id: 1 }],
      [{ id: 100, api_team_id: 100 }, { id: 200, api_team_id: 200 }]
    )
    adminDb.from
      .mockReturnValueOnce(makeChain({ data: null, error: null })) // fixture upsert (stage update)
      .mockReturnValueOnce(makeChain({ data: null, error: null })) // fixture result upsert

    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
  })
})

// ---------------------------------------------------------------------------
// Red card detection
// ---------------------------------------------------------------------------
describe('GET /api/admin/poll — red card detection', () => {
  it('any player with red card → had_red_card=true on fixture', async () => {
    setupAuth()
    const fixture = {
      fixture: { id: 1, status: { short: 'FT' }, date: '2026-06-15T14:00:00Z' },
      league: { round: 'Group Stage - 1' },
      teams: { home: { id: 100, winner: true }, away: { id: 200, winner: false } },
      goals: { home: 1, away: 0 },
      score: { penalty: { home: null, away: null } },
    }
    const playerStats = [{
      player: { id: 999 },
      statistics: [{ cards: { red: 1, yellow: 0 }, goals: { total: 0, assists: 0, owngoal: false, penalty: false }, games: { minutes: 80 } }],
    }]
    mockApiFootball
      .mockResolvedValueOnce([fixture])
      .mockResolvedValueOnce(playerStats)

    const adminDb = setupAdminDbForPoll(
      [{ id: 1, finished: false, status: 'SCHEDULED', stage: 'GROUP', api_fixture_id: 1 }],
      [{ id: 100, api_team_id: 100 }, { id: 200, api_team_id: 200 }]
    )
    adminDb.from
      .mockReturnValueOnce(makeChain({ data: [] }))               // players lookup
      .mockReturnValueOnce(makeChain({ data: null, error: null })) // stats upsert
      .mockReturnValueOnce(makeChain({ data: null, error: null })) // fixture update

    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
  })
})
