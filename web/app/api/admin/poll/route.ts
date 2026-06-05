import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { apiFootball, WORLD_CUP_LEAGUE, SEASON } from '@/lib/apiFootball'
import { playerFantasyPoints, type Pos } from '@/lib/scoring'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const auth = req.headers.get('authorization') ?? ''
  const key = new URL(req.url).searchParams.get('key')
  return auth === `Bearer ${secret}` || key === secret
}

const FINISHED = new Set(['FT', 'AET', 'PEN'])

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

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

    const { data: ourFx } = await db.from('fixtures').select('id, api_fixture_id')
    const fxByApi = new Map<number, number>((ourFx ?? []).map((r: any) => [r.api_fixture_id, r.id]))
    const { data: ourPlayers } = await db.from('players').select('id, api_player_id, position')
    const plByApi = new Map<number, any>((ourPlayers ?? []).map((r: any) => [r.api_player_id, r]))

    const batch = finished.slice(0, limit)
    let fixturesWritten = 0
    let statsWritten = 0

    for (const f of batch) {
      const ourFixtureId = fxByApi.get(f.fixture.id)
      if (!ourFixtureId) continue

      const gh = f.goals?.home ?? 0
      const ga = f.goals?.away ?? 0
      const homeId = f.teams?.home?.id

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
        .update({ score_a: gh, score_b: ga, had_red_card: hadRed, status: 'FINISHED', finished: true })
        .eq('id', ourFixtureId)
      if (fe) throw fe
      fixturesWritten++
    }

    return NextResponse.json({
      ok: true,
      finishedTotal: finished.length,
      processed: batch.length,
      fixturesWritten,
      statsWritten,
    })
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 })
  }
}
