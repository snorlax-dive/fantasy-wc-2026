import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetchAll'
import { teamRatings } from '@/lib/teamStrength'
import { projectedPoints, priceFromExpectedPoints, type ProjectionInput } from '@/lib/projection'
import type { Pos } from '@/lib/scoring'

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

/* eslint-disable @typescript-eslint/no-explicit-any */
async function chunkedUpsert(db: any, table: string, rows: any[], onConflict: string) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from(table).upsert(rows.slice(i, i + 500), { onConflict })
    if (error) throw error
  }
}

const STAGES = ['GROUP', 'R32', 'R16', 'QF', 'SF', 'FINAL']

// Each stage's squads play exactly this many matches before the next re-draft:
// the group stage guarantees 3, every knockout round is single-elimination (1).
function matchesExpectedFor(stage: string): number {
  return stage === 'GROUP' ? 3 : 1
}

// Priority: WC match minutes (strongest) > qualifier start_prob (seed/qualifiers step) > hash fallback.
function startProbFor(
  apiPlayerId: number | null,
  storedStartProb: number | null | undefined,
  observed?: { matches: number; avgMinutes: number }
): number {
  if (observed && observed.matches > 0) {
    return Math.max(0.1, Math.min(0.97, observed.avgMinutes / 90))
  }
  if (storedStartProb != null) {
    return storedStartProb
  }
  const id = apiPlayerId ?? 0
  const h = (((id * 2654435761) >>> 0) % 1000) / 1000
  return 0.15 + 0.75 * (0.7 * 0.5 + 0.3 * h)
}

// Attacking vs defensive mid inference — mirrors seed/route.ts.
function inferMidRole(shirt: number | null | undefined): 'ATK' | 'DEF' {
  return shirt != null && shirt >= 8 && shirt <= 11 ? 'ATK' : 'DEF'
}

// Re-prices every active player ahead of a re-draft, blending each player's
// pre-tournament projection (lib/projection.ts prior) with the form they've
// actually shown so far this tournament (player_match_stats), via shrinkage —
// so prices respond to form without small early samples whipsawing them.
//
// GET /api/admin/reprice?stage=R32[&dry=1]
export async function GET(req: Request) {
  if (!(await authorized(req))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const stage = (url.searchParams.get('stage') ?? '').toUpperCase()
  const dry = url.searchParams.get('dry') === '1'
  if (!STAGES.includes(stage)) {
    return NextResponse.json({ error: `stage must be one of ${STAGES.join(', ')}` }, { status: 400 })
  }

  const db = createAdminClient()
  try {
    const matchesExpected = matchesExpectedFor(stage)

    const players = await fetchAll((from, to) =>
      db.from('players').select('id, api_player_id, position, team_id, active, start_prob').range(from, to)
    )
    const { data: teams } = await db.from('teams').select('id, name')
    const teamNameById = new Map<number, string>((teams ?? []).map((t: any) => [t.id, t.name]))

    // Look up each team's upcoming fixture for the target stage so we can
    // adjust clean-sheet probability by actual opponent attack rating.
    const { data: stageFxRows } = await db
      .from('fixtures')
      .select('team_a, team_b')
      .eq('stage', stage)
    const opponentAttackByTeam = new Map<number, number>()
    for (const fx of stageFxRows ?? []) {
      if (fx.team_a && fx.team_b) {
        const atkA = teamRatings(teamNameById.get(fx.team_a) ?? '').attack
        const atkB = teamRatings(teamNameById.get(fx.team_b) ?? '').attack
        opponentAttackByTeam.set(fx.team_a, atkB)
        opponentAttackByTeam.set(fx.team_b, atkA)
      }
    }

    // Realized form so far: per-player matches played + average minutes/points.
    const stats = await fetchAll((from, to) =>
      db.from('player_match_stats').select('player_id, minutes, fantasy_points').range(from, to)
    )
    const formByPlayer = new Map<number, { matches: number; avgMinutes: number; pointsPerMatch: number }>()
    const accum = new Map<number, { matches: number; minutes: number; points: number }>()
    for (const s of stats) {
      if (s.minutes <= 0) continue
      const a = accum.get(s.player_id) ?? { matches: 0, minutes: 0, points: 0 }
      a.matches += 1
      a.minutes += s.minutes
      a.points += s.fantasy_points
      accum.set(s.player_id, a)
    }
    for (const [pid, a] of accum) {
      formByPlayer.set(pid, { matches: a.matches, avgMinutes: a.minutes / a.matches, pointsPerMatch: a.points / a.matches })
    }

    const updates: { id: number; price: number; expected_points: number }[] = []
    const preview: any[] = []
    for (const p of players) {
      if (p.active === false) continue
      const pos = p.position as Pos
      const { attack, defense } = teamRatings(teamNameById.get(p.team_id))
      const form = formByPlayer.get(p.id)
      const startProb = startProbFor(p.api_player_id, p.start_prob, form ? { matches: form.matches, avgMinutes: form.avgMinutes } : undefined)
      // No shirt number stored on players table — use a deterministic hash split:
      // roughly 1/3 of mids are treated as ATK type (≈ real squad composition).
      const midRole = pos === 'MID' ? (((p.api_player_id ?? 0) % 3) === 0 ? 'ATK' as const : 'DEF' as const) : undefined
      const opponentAttack = opponentAttackByTeam.get(p.team_id)

      const input: ProjectionInput = {
        pos,
        attack,
        defense,
        startProb,
        midRole,
        matchesExpected,
        opponentAttack,
        realized: form ? { matches: form.matches, pointsPerMatch: form.pointsPerMatch } : undefined,
        priorWeight: 3,
      }
      const xPts = projectedPoints(input)
      const price = priceFromExpectedPoints(pos, xPts / matchesExpected)
      const expected_points = Math.round(xPts * 100) / 100
      updates.push({ id: p.id, price, expected_points })
      if (preview.length < 25) preview.push({ id: p.id, pos, price, expected_points, formMatches: form?.matches ?? 0, opponentAttack: opponentAttack ?? null })
    }

    if (!dry && updates.length) await chunkedUpsert(db, 'players', updates, 'id')

    return NextResponse.json({
      ok: true,
      dry,
      stage,
      matchesExpected,
      repriced: dry ? 0 : updates.length,
      considered: updates.length,
      sample: preview,
    })
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 })
  }
}
