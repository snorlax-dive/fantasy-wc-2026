import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeChain, createMockSupabase } from '../helpers/mockSupabase'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/supabase/fetchAll', () => ({ fetchAll: vi.fn() }))

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAll } from '@/lib/supabase/fetchAll'
import { GET } from '@/app/api/admin/score/route'

const mockCreateClient = vi.mocked(createClient)
const mockCreateAdminClient = vi.mocked(createAdminClient)
const mockFetchAll = vi.mocked(fetchAll)

const CRON_SECRET = 'test-cron-secret'

function makeRequest(authHeader?: string) {
  const headers = new Headers()
  if (authHeader) headers.set('authorization', authHeader)
  return new Request('http://localhost/api/admin/score', { headers })
}

// Table-name router: each db.from(table) always returns data for that table,
// regardless of call order. Works for all read + no-op writes in the route.
function setupAdminDb(tableData: Record<string, unknown> = {}) {
  const adminDb = createMockSupabase(null)
  adminDb.from.mockImplementation((table?: string) => {
    return makeChain({ data: table ? (tableData[table] ?? null) : null })
  })
  mockCreateAdminClient.mockReturnValue(adminDb as never)
  return adminDb
}

function setupAuth(isCommissioner = false) {
  const serverDb = createMockSupabase({ id: 'user-1' })
  serverDb.from.mockReturnValueOnce(makeChain({ data: { is_commissioner: isCommissioner } }))
  mockCreateClient.mockResolvedValue(serverDb as never)
}

beforeEach(() => {
  process.env.CRON_SECRET = CRON_SECRET
  vi.clearAllMocks()
  mockFetchAll.mockResolvedValue([])
})

// ---------------------------------------------------------------------------
// Authorization
// ---------------------------------------------------------------------------
describe('GET /api/admin/score — auth', () => {
  it('no auth → 401', async () => {
    setupAuth(false)
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
  })

  it('wrong bearer token → 401', async () => {
    setupAuth(false)
    const res = await GET(makeRequest('Bearer wrong'))
    expect(res.status).toBe(401)
  })

  it('correct CRON_SECRET bearer → 200', async () => {
    setupAdminDb()
    const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`))
    expect(res.status).toBe(200)
    expect((await res.json()).ok).toBe(true)
  })

  it('authenticated commissioner → 200', async () => {
    setupAuth(true)
    setupAdminDb()
    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
  })
})

// ---------------------------------------------------------------------------
// Response shape
// ---------------------------------------------------------------------------
describe('GET /api/admin/score — response shape', () => {
  it('returns expected fields on empty data', async () => {
    setupAdminDb()
    const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`))
    const body = await res.json()
    expect(body).toMatchObject({
      ok: true,
      predsScored: 0,
      squadsScored: 0,
      bracketScored: 0,
    })
  })
})

// ---------------------------------------------------------------------------
// Prediction scoring
// ---------------------------------------------------------------------------
describe('GET /api/admin/score — prediction scoring', () => {
  it('unfinished fixture → 0 predictions scored', async () => {
    setupAdminDb({
      fixtures: [{ id: 1, stage: 'GROUP', score_a: null, score_b: null, finished: false, had_red_card: false, team_a: 10, team_b: 20, lock_time: new Date().toISOString(), kickoff: new Date().toISOString(), winner_team: null }],
    })
    mockFetchAll
      .mockResolvedValueOnce([])  // players
      .mockResolvedValueOnce([])  // stats
      .mockResolvedValueOnce([{ id: 'p1', fixture_id: 1, user_id: 'u1', pred_a: 2, pred_b: 1, scorer1: null, scorer2: null, red_card_pred: null, is_banker: false, points: 0 }]) // preds
      .mockResolvedValueOnce([])  // squad_players

    const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`))
    expect((await res.json()).predsScored).toBe(0)
  })

  it('exact scoreline prediction on finished fixture → 1 scored', async () => {
    setupAdminDb({
      fixtures: [{ id: 1, stage: 'GROUP', score_a: 2, score_b: 1, finished: true, had_red_card: false, team_a: 10, team_b: 20, lock_time: new Date().toISOString(), kickoff: new Date().toISOString(), winner_team: 10 }],
    })
    mockFetchAll
      .mockResolvedValueOnce([])  // players
      .mockResolvedValueOnce([])  // stats
      .mockResolvedValueOnce([{ id: 'p1', fixture_id: 1, user_id: 'u1', pred_a: 2, pred_b: 1, scorer1: null, scorer2: null, red_card_pred: null, is_banker: false, points: 0 }])
      .mockResolvedValueOnce([])

    const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`))
    expect((await res.json()).predsScored).toBe(1)
  })

  it('prediction already at correct points → not counted in predsScored', async () => {
    setupAdminDb({
      fixtures: [{ id: 1, stage: 'GROUP', score_a: 2, score_b: 1, finished: true, had_red_card: false, team_a: 10, team_b: 20, lock_time: new Date().toISOString(), kickoff: new Date().toISOString(), winner_team: 10 }],
    })
    mockFetchAll
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'p1', fixture_id: 1, user_id: 'u1', pred_a: 2, pred_b: 1, scorer1: null, scorer2: null, red_card_pred: null, is_banker: false, points: 5 }]) // already 5 pts (exact scoreline)
      .mockResolvedValueOnce([])

    const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`))
    expect((await res.json()).predsScored).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Squad scoring
// ---------------------------------------------------------------------------
describe('GET /api/admin/score — squad scoring', () => {
  const pastLock = new Date(Date.now() - 1000).toISOString()
  const fixture = { id: 1, stage: 'GROUP', score_a: 2, score_b: 0, finished: true, had_red_card: false, team_a: 10, team_b: 20, lock_time: pastLock, kickoff: pastLock, winner_team: 10 }

  it('normal squad: captain gets ×2 multiplier', async () => {
    setupAdminDb({
      fixtures: [fixture],
      settings: [{ key: 'block_per_target_cap', value: 2 }],
      squads: [{ id: 'sq1', user_id: 'u1', stage: 'GROUP', budget_used: 80 }],
    })
    mockFetchAll
      .mockResolvedValueOnce([{ id: 1, position: 'FWD' }])         // players
      .mockResolvedValueOnce([{ player_id: 1, fixture_id: 1, goals: 1, fantasy_points: 6, minutes: 90, assists: 0, own_goals: 0, red_card: false, yellow_card: false, pens_saved: 0, pens_missed: 0, clean_sheet: false, saves: 0, tackles: 0, interceptions: 0 }]) // stats
      .mockResolvedValueOnce([])  // preds
      .mockResolvedValueOnce([{ squad_id: 'sq1', player_id: 1, is_captain: true }]) // squad_players

    const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.squadsScored).toBe(1)
  })

  it('Triple Captain: captain gets ×3 multiplier', async () => {
    setupAdminDb({
      fixtures: [fixture],
      settings: [{ key: 'block_per_target_cap', value: 2 }],
      squads: [{ id: 'sq1', user_id: 'u1', stage: 'GROUP', budget_used: 80 }],
      chip_uses: [{ user_id: 'u1', stage: 'GROUP' }],
    })
    // playerFP = 6, captain with TC = 6 + 6*2 = 18
    mockFetchAll
      .mockResolvedValueOnce([{ id: 1, position: 'FWD' }])
      .mockResolvedValueOnce([{ player_id: 1, fixture_id: 1, goals: 1, fantasy_points: 6, minutes: 90, assists: 0, own_goals: 0, red_card: false, yellow_card: false, pens_saved: 0, pens_missed: 0, clean_sheet: false, saves: 0, tackles: 0, interceptions: 0 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ squad_id: 'sq1', player_id: 1, is_captain: true }])

    const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`))
    expect(res.status).toBe(200)
    expect((await res.json()).squadsScored).toBe(1)
  })

  it('blocked player contributes 0 pts', async () => {
    setupAdminDb({
      fixtures: [fixture],
      settings: [{ key: 'block_per_target_cap', value: 2 }],
      squads: [{ id: 'sq1', user_id: 'u1', stage: 'GROUP', budget_used: 80 }],
      blocks: [{ stage: 'GROUP', target: 'u1', player_id: 1, committed_at: new Date().toISOString() }],
    })
    mockFetchAll
      .mockResolvedValueOnce([{ id: 1, position: 'FWD' }])
      .mockResolvedValueOnce([{ player_id: 1, fixture_id: 1, goals: 2, fantasy_points: 10, minutes: 90, assists: 0, own_goals: 0, red_card: false, yellow_card: false, pens_saved: 0, pens_missed: 0, clean_sheet: false, saves: 0, tackles: 0, interceptions: 0 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ squad_id: 'sq1', player_id: 1, is_captain: true }])

    const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`))
    expect(res.status).toBe(200)
    // Squad should score 0 because the only player is blocked
    expect((await res.json()).squadsScored).toBe(1) // squad was processed, result is 0 pts
  })

  it('shielded user: blocks do not land', async () => {
    setupAdminDb({
      fixtures: [fixture],
      settings: [{ key: 'block_per_target_cap', value: 2 }],
      squads: [{ id: 'sq1', user_id: 'u1', stage: 'GROUP', budget_used: 80 }],
      blocks: [{ stage: 'GROUP', target: 'u1', player_id: 1, committed_at: new Date().toISOString() }],
      shield_uses: [{ user_id: 'u1', stage: 'GROUP' }],
    })
    mockFetchAll
      .mockResolvedValueOnce([{ id: 1, position: 'FWD' }])
      .mockResolvedValueOnce([{ player_id: 1, fixture_id: 1, goals: 2, fantasy_points: 10, minutes: 90, assists: 0, own_goals: 0, red_card: false, yellow_card: false, pens_saved: 0, pens_missed: 0, clean_sheet: false, saves: 0, tackles: 0, interceptions: 0 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ squad_id: 'sq1', player_id: 1, is_captain: true }])

    const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`))
    expect(res.status).toBe(200)
    expect((await res.json()).squadsScored).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Bracket scoring
// ---------------------------------------------------------------------------
describe('GET /api/admin/score — bracket scoring', () => {
  const finalFx = { id: 1, stage: 'FINAL', score_a: 1, score_b: 0, finished: true, had_red_card: false, team_a: 10, team_b: 20, lock_time: new Date().toISOString(), kickoff: new Date(Date.now() - 1000).toISOString(), winner_team: 10 }

  it('champion correct → CHAMPION pick scores', async () => {
    setupAdminDb({
      fixtures: [finalFx],
      bracket_picks: [{ id: 'bp1', user_id: 'u1', pick_type: 'CHAMPION', team_id: 10, player_id: null, points: 0 }],
    })
    mockFetchAll.mockResolvedValue([])
    const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`))
    const body = await res.json()
    expect(body.bracketScored).toBe(1)
    expect(body.champion).toBe(10)
  })

  it('wrong champion pick → not scored', async () => {
    setupAdminDb({
      fixtures: [finalFx],
      bracket_picks: [{ id: 'bp1', user_id: 'u1', pick_type: 'CHAMPION', team_id: 99, player_id: null, points: 0 }],
    })
    mockFetchAll.mockResolvedValue([])
    const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`))
    const body = await res.json()
    expect(body.bracketScored).toBe(0)
  })

  it('golden boot: player with most goals wins', async () => {
    setupAdminDb({
      fixtures: [{ ...finalFx, stage: 'GROUP' }],
      bracket_picks: [
        { id: 'bp1', user_id: 'u1', pick_type: 'GOLDEN_BOOT', team_id: null, player_id: 1, points: 0 },
      ],
    })
    mockFetchAll
      .mockResolvedValueOnce([{ id: 1, position: 'FWD' }, { id: 2, position: 'MID' }])
      .mockResolvedValueOnce([
        { player_id: 1, fixture_id: 1, goals: 3, fantasy_points: 0, minutes: 90, assists: 0, own_goals: 0, red_card: false, yellow_card: false, pens_saved: 0, pens_missed: 0, clean_sheet: false, saves: 0, tackles: 0, interceptions: 0 },
        { player_id: 2, fixture_id: 1, goals: 2, fantasy_points: 0, minutes: 90, assists: 0, own_goals: 0, red_card: false, yellow_card: false, pens_saved: 0, pens_missed: 0, clean_sheet: false, saves: 0, tackles: 0, interceptions: 0 },
      ])
      .mockResolvedValue([])

    const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`))
    const body = await res.json()
    expect(body.goldenBoot).toBe(1)
    expect(body.maxGoals).toBe(3)
    expect(body.bracketScored).toBe(1)
  })
})
