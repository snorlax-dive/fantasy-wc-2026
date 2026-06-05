import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { apiFootball, WORLD_CUP_LEAGUE, SEASON } from '@/lib/apiFootball'
import { teamStrength } from '@/lib/teamStrength'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

// ---- auth: CRON_SECRET (Bearer / ?key=) OR an authenticated commissioner ----
async function authorized(req: Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') ?? ''
  const key = new URL(req.url).searchParams.get('key')
  if (secret && (auth === `Bearer ${secret}` || key === secret)) return true
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

type Pos = 'GK' | 'DEF' | 'MID' | 'FWD'

function mapPosition(p: string | null | undefined): Pos {
  const s = (p ?? '').toLowerCase()
  if (s.startsWith('goal')) return 'GK'
  if (s.startsWith('def')) return 'DEF'
  if (s.startsWith('mid')) return 'MID'
  return 'FWD'
}

function mapStage(round: string): 'GROUP' | 'R32' | 'R16' | 'QF' | 'SF' | 'FINAL' {
  const s = round.toLowerCase()
  if (s.includes('group')) return 'GROUP'
  if (s.includes('round of 32')) return 'R32'
  if (s.includes('round of 16')) return 'R16'
  if (s.includes('quarter')) return 'QF'
  if (s.includes('semi')) return 'SF'
  return 'FINAL' // final + third-place
}

// FPL-inspired pricing with a SKEWED spread: most players are cheap "enablers"
// (€4.0–6), a minority are premiums (€10–13.5). Strong teams get pricier stars.
// The skew (h^1.7) is the key — without it prices cluster and there are no cheap
// options to balance a premium. Deterministic (stable across re-seeds).
const PRICE_FLOOR: Record<Pos, number> = { GK: 4.0, DEF: 4.0, MID: 4.5, FWD: 4.5 }
const PRICE_STR: Record<Pos, number> = { GK: 1.8, DEF: 3.0, MID: 6.5, FWD: 8.5 }
const PRICE_JIT: Record<Pos, number> = { GK: 0.5, DEF: 1.0, MID: 2.0, FWD: 2.5 }
function priceFor(pos: Pos, strength: number, apiPlayerId: number): number {
  const h = (((apiPlayerId * 2654435761) >>> 0) % 1000) / 1000 // deterministic 0..1
  const skew = Math.pow(h, 1.7) // bias toward the floor → lots of cheap players
  const raw = PRICE_FLOOR[pos] + (PRICE_STR[pos] * strength + PRICE_JIT[pos]) * skew
  return Math.min(13.5, Math.max(4.0, Math.round(raw * 2) / 2)) // clamp + nearest 0.5
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function GET(req: Request) {
  if (!(await authorized(req))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const step = url.searchParams.get('step') ?? 'base'
  const dry = url.searchParams.get('dry') === '1'
  const offset = parseInt(url.searchParams.get('offset') ?? '0', 10)
  const limit = parseInt(url.searchParams.get('limit') ?? '12', 10)
  // Season is overridable so we can build on free 2022 data and switch to 2026 later.
  const season = parseInt(url.searchParams.get('season') ?? String(SEASON), 10)
  const db = createAdminClient()

  try {
    // ---------- STEP: base (teams + fixtures) ----------
    if (step === 'base') {
      const teams = await apiFootball<any>('/teams', { league: WORLD_CUP_LEAGUE, season })
      const fixtures = await apiFootball<any>('/fixtures', {
        league: WORLD_CUP_LEAGUE,
        season,
      })

      if (dry) {
        return NextResponse.json({
          dry: true,
          step,
          season,
          teamCount: teams.length,
          fixtureCount: fixtures.length,
          sampleTeam: teams[0] ?? null,
          sampleFixtureRound: fixtures[0]?.league?.round ?? null,
          sampleFixture: fixtures[0] ?? null,
          stageBreakdown: fixtures.reduce((acc: Record<string, number>, f: any) => {
            const s = mapStage(f?.league?.round ?? '')
            acc[s] = (acc[s] ?? 0) + 1
            return acc
          }, {}),
        })
      }

      const teamRows = teams.map((t: any) => ({
        api_team_id: t.team.id,
        name: t.team.name,
        code: t.team.code ?? null,
        flag_url: t.team.logo ?? null,
      }))
      const { error: tErr } = await db.from('teams').upsert(teamRows, { onConflict: 'api_team_id' })
      if (tErr) throw tErr

      const { data: teamMap } = await db.from('teams').select('id, api_team_id')
      const idByApi = new Map<number, number>((teamMap ?? []).map((r: any) => [r.api_team_id, r.id]))

      const fxRows = fixtures.map((f: any) => {
        const kickoff = f.fixture.date
        return {
          api_fixture_id: f.fixture.id,
          round: f.league?.round ?? 'Unknown',
          stage: mapStage(f.league?.round ?? ''),
          kickoff,
          lock_time: kickoff,
          team_a: idByApi.get(f.teams?.home?.id) ?? null,
          team_b: idByApi.get(f.teams?.away?.id) ?? null,
          status: 'SCHEDULED' as const,
        }
      })
      const { error: fErr } = await db
        .from('fixtures')
        .upsert(fxRows, { onConflict: 'api_fixture_id' })
      if (fErr) throw fErr

      return NextResponse.json({ ok: true, step, teams: teamRows.length, fixtures: fxRows.length })
    }

    // ---------- STEP: players (squads, batched to avoid timeouts) ----------
    if (step === 'players') {
      const { data: dbTeams, error } = await db
        .from('teams')
        .select('id, api_team_id, name')
        .order('id')
      if (error) throw error
      const all = dbTeams ?? []

      if (dry) {
        const first = all[0]
        const squad = first
          ? await apiFootball<any>('/players/squads', { team: first.api_team_id })
          : []
        return NextResponse.json({
          dry: true,
          step,
          totalTeams: all.length,
          note: all.length === 0 ? 'Run step=base first (no teams in DB yet).' : undefined,
          sampleTeam: first?.name ?? null,
          samplePlayers: (squad?.[0]?.players ?? []).slice(0, 5),
        })
      }

      const slice = all.slice(offset, offset + limit)
      let inserted = 0
      for (const t of slice) {
        const squad = await apiFootball<any>('/players/squads', { team: t.api_team_id })
        const players = squad?.[0]?.players ?? []
        const strength = teamStrength(t.name)
        const rows = players.map((p: any) => {
          const pos = mapPosition(p.position)
          return {
            api_player_id: p.id,
            team_id: t.id,
            name: p.name,
            position: pos,
            price: priceFor(pos, strength, p.id),
            photo_url: p.photo ?? null,
            active: true,
          }
        })
        if (rows.length) {
          const { error: pErr } = await db
            .from('players')
            .upsert(rows, { onConflict: 'api_player_id' })
          if (pErr) throw pErr
          inserted += rows.length
        }
      }

      const nextOffset = offset + slice.length
      return NextResponse.json({
        ok: true,
        step,
        processedTeams: slice.length,
        inserted,
        nextOffset,
        done: nextOffset >= all.length,
        hint:
          nextOffset >= all.length
            ? 'All squads seeded.'
            : `Call again with &offset=${nextOffset}`,
      })
    }

    return NextResponse.json({ error: `unknown step '${step}' (use base or players)` }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 })
  }
}
