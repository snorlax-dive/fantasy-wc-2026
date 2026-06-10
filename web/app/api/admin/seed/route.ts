import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { apiFootball, WORLD_CUP_LEAGUE, SEASON } from '@/lib/apiFootball'
import { teamRatings } from '@/lib/teamStrength'
import { projectedPointsPerMatch, projectedPoints, priceFromExpectedPoints, derivePersonalAttack, inferMidRole, mapPosition, startProbFor } from '@/lib/projection'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

// ---- auth: CRON_SECRET (Bearer / ?key=) OR an authenticated commissioner ----
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

type Pos = 'GK' | 'DEF' | 'MID' | 'FWD'


function mapStage(round: string): 'GROUP' | 'R32' | 'R16' | 'QF' | 'SF' | 'FINAL' {
  const s = round.toLowerCase()
  if (s.includes('group')) return 'GROUP'
  if (s.includes('round of 32')) return 'R32'
  if (s.includes('round of 16')) return 'R16'
  if (s.includes('quarter')) return 'QF'
  if (s.includes('semi')) return 'SF'
  return 'FINAL' // final + third-place
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

      // Build team id → name map so we can resolve opponent names from fixture rows.
      const teamNameById = new Map<number, string>((all).map((t: any) => [t.id, t.name]))

      const slice = all.slice(offset, offset + limit)
      let inserted = 0
      for (const t of slice) {
        const squad = await apiFootball<any>('/players/squads', { team: t.api_team_id })
        const players = squad?.[0]?.players ?? []
        const { attack, defense } = teamRatings(t.name)

        // Load this team's GROUP fixtures to compute opponent-adjusted projections.
        // Falls back to a flat 3-match projection if fixtures aren't seeded yet.
        const { data: groupFx } = await db
          .from('fixtures')
          .select('team_a, team_b')
          .eq('stage', 'GROUP')
          .or(`team_a.eq.${t.id},team_b.eq.${t.id}`)

        const rows = players.map((p: any) => {
          const pos = mapPosition(p.position)
          const startProb = startProbFor(p.id, p.number)
          const midRole = pos === 'MID' ? inferMidRole(p.number) : undefined

          let xPts: number
          if ((groupFx ?? []).length === 3) {
            // Sum per-fixture projections using each opponent's actual attack rating.
            xPts = (groupFx ?? []).reduce((sum: number, fx: any) => {
              const oppId = fx.team_a === t.id ? fx.team_b : fx.team_a
              const { attack: oppAtk } = teamRatings(teamNameById.get(oppId) ?? '')
              return sum + projectedPointsPerMatch({ pos, attack, defense, startProb, midRole, opponentAttack: oppAtk, matchesExpected: 1 })
            }, 0)
          } else {
            xPts = projectedPoints({ pos, attack, defense, startProb, midRole, matchesExpected: 3 })
          }

          return {
            api_player_id: p.id,
            team_id: t.id,
            name: p.name,
            position: pos,
            price: priceFromExpectedPoints(pos, xPts / 3),
            expected_points: Math.round(xPts * 100) / 100,
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

    // ---------- STEP: qualifiers (refine startProb + prices from real qualifier minutes) ----------
    if (step === 'qualifiers') {
      // Optional: filter statistics to specific qualifier league IDs (e.g. "29,30,32,33,34").
      // When omitted, all national-team competition stats for the season are summed —
      // this is safe because a national-team API id only returns national-team competitions.
      const leagueFilter = (url.searchParams.get('leagues') ?? '')
        .split(',').map(Number).filter(Boolean)

      const { data: dbTeams, error: teamsErr } = await db
        .from('teams').select('id, api_team_id, name').order('id')
      if (teamsErr) throw teamsErr
      const all = dbTeams ?? []

      if (dry) {
        return NextResponse.json({
          dry: true,
          step,
          totalTeams: all.length,
          leagueFilter: leagueFilter.length ? leagueFilter : 'all (no filter)',
          note: 'Run step=players first, then qualifiers to refine prices using real minutes data.',
        })
      }

      const teamNameById = new Map<number, string>(all.map((t: any) => [t.id, t.name]))
      const slice = all.slice(offset, offset + limit)

      // Pre-load GROUP fixtures for opponent-adjusted projection (same logic as step=players).
      const { data: allGroupFx } = await db.from('fixtures').select('team_a, team_b').eq('stage', 'GROUP')
      const groupFxByTeam = new Map<number, any[]>()
      for (const fx of allGroupFx ?? []) {
        for (const tid of [fx.team_a, fx.team_b].filter(Boolean)) {
          if (!groupFxByTeam.has(tid)) groupFxByTeam.set(tid, [])
          groupFxByTeam.get(tid)!.push(fx)
        }
      }

      // Does the players table have the personal_attack column yet (migration 0010)?
      // If not, omit it from updates so the step still works (start_prob/price/xpts)
      // rather than crashing on an unknown column.
      let hasPersonalAttack = true
      {
        const probe = await db.from('players').select('personal_attack').limit(1)
        if (probe.error) hasPersonalAttack = false
      }

      let updated = 0
      const preview: any[] = []

      for (const t of slice) {
        // Fetch all pages of /players for this national team.
        // WC squads are ≤26 players, so at most 2 pages (API paginates at 20).
        const allEntries: any[] = []
        for (let page = 1; page <= 3; page++) {
          const batch = await apiFootball<any>('/players', { team: t.api_team_id, season, page })
          allEntries.push(...batch)
          if (batch.length < 20) break
        }
        if (!allEntries.length) continue

        const { attack, defense } = teamRatings(t.name)
        const groupFx = groupFxByTeam.get(t.id) ?? []

        // Load existing players for this team to cross-reference api_player_id → internal id + position.
        const { data: teamPlayers } = await db
          .from('players').select('id, api_player_id, position').eq('team_id', t.id)
        const playerMap = new Map<number, { id: number; pos: Pos }>(
          (teamPlayers ?? []).map((p: any) => [p.api_player_id, { id: p.id, pos: p.position as Pos }])
        )

        const playerUpdates: any[] = []

        for (const entry of allEntries) {
          const apiId = entry.player?.id
          if (!apiId) continue
          const our = playerMap.get(apiId)
          if (!our) continue

          // Optionally restrict to specific qualifier leagues; otherwise sum all competitions.
          const stats: any[] = leagueFilter.length
            ? (entry.statistics ?? []).filter((s: any) => leagueFilter.includes(s.league?.id))
            : (entry.statistics ?? [])

          let totalMinutes = 0
          let totalAppearances = 0
          let totalLineups = 0
          let totalGoals = 0
          let totalAssists = 0
          for (const s of stats) {
            totalMinutes += s.games?.minutes ?? 0
            totalAppearances += s.games?.appearences ?? 0
            totalLineups += s.games?.lineups ?? 0
            totalGoals += s.goals?.total ?? 0
            totalAssists += s.goals?.assists ?? 0
          }
          if (totalAppearances <= 0) continue

          const { pos } = our
          // Use shirt number from stats so role classification is consistent across
          // steps and re-running qualifiers doesn't cause price churn.
          const shirtNumber = (stats[0] ?? entry.statistics?.[0])?.games?.number ?? null
          const midRole = pos === 'MID'
            ? inferMidRole(shirtNumber, { goals: totalGoals, assists: totalAssists, appearances: totalAppearances })
            : undefined

          // Use lineup starts as the rawProb denominator when available: measures
          // "average fraction of 90 min played per start" rather than per appearance,
          // avoiding the penalty for sub appearances that dragged down star FWDs/MIDs.
          // Use lineups count as the shrinkage sample size so sub-only games don't
          // dilute the evidence base.
          const shirtBasedProb = startProbFor(apiId, shirtNumber)
          const nForShrinkage = totalLineups > 0 ? totalLineups : totalAppearances
          const rawProb = totalMinutes / (nForShrinkage * 90)
          const wSp = 4
          const startProb = Math.min(0.97, Math.max(0.10,
            (wSp * shirtBasedProb + nForShrinkage * rawProb) / (wSp + nForShrinkage)
          ))

          const personalAttack = derivePersonalAttack(pos, attack, {
            totalGoals, totalAssists, totalMinutes, totalAppearances,
          }, midRole)

          let xPts: number
          if (groupFx.length === 3) {
            xPts = (groupFx as any[]).reduce((sum: number, fx: any) => {
              const oppId = fx.team_a === t.id ? fx.team_b : fx.team_a
              const { attack: oppAtk } = teamRatings(teamNameById.get(oppId) ?? '')
              return sum + projectedPointsPerMatch({
                pos, attack, defense, startProb, midRole, opponentAttack: oppAtk, matchesExpected: 1,
                personalAttack: personalAttack ?? undefined,
              })
            }, 0)
          } else {
            xPts = projectedPoints({ pos, attack, defense, startProb, midRole, matchesExpected: 3,
              personalAttack: personalAttack ?? undefined,
            })
          }

          const price = priceFromExpectedPoints(pos, xPts / 3)
          const expected_points = Math.round(xPts * 100) / 100
          playerUpdates.push({ id: our.id, start_prob: startProb, price, expected_points, personal_attack: personalAttack })

          if (preview.length < 20) {
            preview.push({
              name: entry.player?.name,
              team: t.name,
              pos,
              startProb: `${Math.round(startProb * 100)}%`,
              totalMinutes,
              totalAppearances,
              price,
              expected_points,
              personal_attack: personalAttack,
            })
          }
        }

        if (playerUpdates.length) {
          // These rows already exist — use UPDATE, not upsert. (Upsert's INSERT path
          // would require NOT NULL team_id/name/position, which we don't resupply here,
          // and would fail with a not-null violation.)
          const results = await Promise.all(
            playerUpdates.map((u) =>
              db
                .from('players')
                .update({
                  start_prob: u.start_prob,
                  price: u.price,
                  expected_points: u.expected_points,
                  ...(hasPersonalAttack ? { personal_attack: u.personal_attack } : {}),
                })
                .eq('id', u.id)
            )
          )
          const failed = results.find((r) => r.error)
          if (failed?.error) throw failed.error
          updated += playerUpdates.length
        }
      }

      const nextOffset = offset + slice.length
      return NextResponse.json({
        ok: true,
        step,
        processedTeams: slice.length,
        updated,
        nextOffset,
        done: nextOffset >= all.length,
        hint: nextOffset >= all.length
          ? 'All teams processed. Run score to recompute fantasy totals.'
          : `Call again with &offset=${nextOffset}`,
        sample: preview,
      })
    }

    return NextResponse.json({ error: `unknown step '${step}' (use base, players, or qualifiers)` }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 })
  }
}
