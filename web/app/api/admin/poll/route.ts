import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetchAll'
import { apiFootball, WORLD_CUP_LEAGUE, SEASON } from '@/lib/apiFootball'
import { playerFantasyPoints, type Pos } from '@/lib/scoring'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function authorized(req: Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') ?? ''
  if (secret && auth === `Bearer ${secret}`) return true
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return false
  const { data } = await supabase
    .from('profiles')
    .select('is_commissioner')
    .eq('id', user.id)
    .maybeSingle()
  return data?.is_commissioner === true
}

const FINISHED = new Set(['FT', 'AET', 'PEN'])
const LIVE = new Set(['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE', 'INT', 'SUSP'])

function mapStage(round: string): 'GROUP' | 'R32' | 'R16' | 'QF' | 'SF' | 'FINAL' {
  const s = (round ?? '').toLowerCase()
  if (s.includes('group')) return 'GROUP'
  if (s.includes('round of 32')) return 'R32'
  if (s.includes('round of 16')) return 'R16'
  if (s.includes('quarter')) return 'QF'
  if (s.includes('semi')) return 'SF'
  return 'FINAL'
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function GET(req: Request) {
  if (!(await authorized(req))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const season = parseInt(url.searchParams.get('season') ?? String(SEASON), 10)
  const dry = url.searchParams.get('dry') === '1'
  const limit = parseInt(url.searchParams.get('limit') ?? '10', 10)
  const db = createAdminClient()

  try {
    const fixtures = await apiFootball<any>('/fixtures', { league: WORLD_CUP_LEAGUE, season })
    const finished = fixtures.filter((f) => FINISHED.has(f.fixture?.status?.short))

    if (dry) {
      const sample = finished[0]
      let samplePlayers = null
      if (sample) {
        const pl = await apiFootball<any>('/fixtures/players', { fixture: sample.fixture.id })
        samplePlayers = (pl?.[0]?.players ?? []).slice(0, 3)
      }
      return NextResponse.json({
        dry: true,
        totalFixtures: fixtures.length,
        finished: finished.length,
        sampleFixtureId: sample?.fixture?.id ?? null,
        samplePlayers,
      })
    }

    const force = url.searchParams.get('force') === '1'

    // Teams map (api id → our id) for matchups + winner.
    const { data: ourTeams } = await db.from('teams').select('id, api_team_id')
    const teamByApi = new Map<number, number>((ourTeams ?? []).map((t: any) => [t.api_team_id, t.id]))

    // Auto-seed: upsert scheduling fields for ALL fixtures so new knockout matchups
    // appear automatically (no manual re-seed). Does NOT touch score/finished/status.
    const fxRows = fixtures.map((f: any) => ({
      api_fixture_id: f.fixture.id,
      round: f.league?.round ?? 'Unknown',
      stage: mapStage(f.league?.round ?? ''),
      kickoff: f.fixture.date,
      lock_time: f.fixture.date,
      team_a: teamByApi.get(f.teams?.home?.id) ?? null,
      team_b: teamByApi.get(f.teams?.away?.id) ?? null,
    }))
    if (fxRows.length) {
      const { error: seedErr } = await db.from('fixtures').upsert(fxRows, { onConflict: 'api_fixture_id' })
      if (seedErr) throw seedErr
    }

    const { data: ourFx } = await db.from('fixtures').select('id, api_fixture_id, finished')
    const fxByApi = new Map<number, any>((ourFx ?? []).map((r: any) => [r.api_fixture_id, r]))
    const ourPlayers = await fetchAll((from, to) =>
      db.from('players').select('id, api_player_id, position').range(from, to)
    )
    const plByApi = new Map<number, any>(ourPlayers.map((r: any) => [r.api_player_id, r]))

    // Only ingest matches finished in the API but not yet finished in our DB, so a
    // frequent cron stays cheap. `force=1` reprocesses all finished fixtures (corrections).
    const pending = finished.filter((f) => {
      const o = fxByApi.get(f.fixture.id)
      return o && (force || !o.finished)
    })
    // Live matches are re-processed every run for provisional (live) points.
    const live = fixtures.filter((f: any) => LIVE.has(f.fixture?.status?.short) && fxByApi.get(f.fixture.id))
    const toProcess = [...live, ...pending].slice(0, limit)
    let fixturesWritten = 0
    let statsWritten = 0

    for (const f of toProcess) {
      const ourFixtureId = fxByApi.get(f.fixture.id)?.id
      if (!ourFixtureId) continue
      const isFinished = FINISHED.has(f.fixture?.status?.short)

      const gh = f.goals?.home ?? 0
      const ga = f.goals?.away ?? 0
      const homeId = f.teams?.home?.id
      const winnerApi =
        f.teams?.home?.winner === true ? homeId : f.teams?.away?.winner === true ? f.teams?.away?.id : null
      const winnerTeam = winnerApi != null ? teamByApi.get(winnerApi) ?? null : null

      const teamsPlayers = await apiFootball<any>('/fixtures/players', { fixture: f.fixture.id })
      let hadRed = false
      const statRows: any[] = []

      for (const tb of teamsPlayers) {
        const conceded = tb.team?.id === homeId ? ga : gh
        for (const pp of tb.players ?? []) {
          const our = plByApi.get(pp.player?.id)
          if (!our) continue
          const st = pp.statistics?.[0] ?? {}
          const minutes = st.games?.minutes ?? 0
          const goals = st.goals?.total ?? 0
          const red = (st.cards?.red ?? 0) > 0
          const pensSaved = st.penalty?.saved ?? 0
          const pensMissed = st.penalty?.missed ?? 0
          if (red) hadRed = true
          const cleanSheet = conceded === 0
          const stat = {
            minutes,
            goals,
            own_goals: 0,
            red_card: red,
            pens_saved: pensSaved,
            pens_missed: pensMissed,
            clean_sheet: cleanSheet,
          }
          statRows.push({
            fixture_id: ourFixtureId,
            player_id: our.id,
            ...stat,
            fantasy_points: playerFantasyPoints(stat, our.position as Pos),
          })
        }
      }

      if (statRows.length) {
        const { error } = await db
          .from('player_match_stats')
          .upsert(statRows, { onConflict: 'fixture_id,player_id' })
        if (error) throw error
        statsWritten += statRows.length
      }

      const { error: fe } = await db
        .from('fixtures')
        .update({
          score_a: gh,
          score_b: ga,
          had_red_card: hadRed,
          status: isFinished ? 'FINISHED' : 'LIVE',
          finished: isFinished,
          winner_team: isFinished ? winnerTeam : null,
        })
        .eq('id', ourFixtureId)
      if (fe) throw fe
      fixturesWritten++
    }

    return NextResponse.json({
      ok: true,
      finishedTotal: finished.length,
      live: live.length,
      pending: pending.length,
      processed: toProcess.length,
      fixturesWritten,
      statsWritten,
    })
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 })
  }
}
