import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  scorePrediction,
  playerFantasyPoints,
  BRACKET_POINTS,
  DIFFERENTIAL_THRESHOLD,
  DIFFERENTIAL_BONUS_PER_GOAL,
  type Pos,
  type Prediction,
} from '@/lib/scoring'

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

async function chunkedUpsert(db: any, table: string, rows: any[], onConflict: string) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from(table).upsert(rows.slice(i, i + 500), { onConflict })
    if (error) throw error
  }
}

const STAGE_ORDER: Record<string, number> = { GROUP: 0, R32: 1, R16: 2, QF: 3, SF: 4, FINAL: 5 }
const REACH_LEVEL: Record<string, number> = { REACH_R16: 2, REACH_QF: 3, REACH_SF: 4, REACH_FINAL: 5 }

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const db = createAdminClient()

  try {
    const [{ data: players }, { data: stats }, { data: fixtures }] = await Promise.all([
      db.from('players').select('id, position'),
      db.from('player_match_stats').select('*'),
      db.from('fixtures').select('id, stage, score_a, score_b, had_red_card, finished, team_a, team_b'),
    ])
    const posById = new Map<number, Pos>((players ?? []).map((p: any) => [p.id, p.position]))
    const allStats = stats ?? []
    const allFixtures = fixtures ?? []

    // --- 1. recompute player_match_stats.fantasy_points (single source of truth) ---
    const statFpRows: any[] = []
    for (const s of allStats) {
      const pos = posById.get(s.player_id)
      if (!pos) continue
      const fp = playerFantasyPoints(s, pos)
      if (fp !== s.fantasy_points) statFpRows.push({ ...s, fantasy_points: fp })
    }
    if (statFpRows.length) await chunkedUpsert(db, 'player_match_stats', statFpRows, 'fixture_id,player_id')

    const stageOf = new Map<number, string>(allFixtures.map((f: any) => [f.id, f.stage]))
    // per (player, stage) totals
    const totalsKey = (pid: number, stage: string) => `${pid}:${stage}`
    const stageTotals = new Map<string, { fantasy: number; goals: number }>()
    const scorersByFixture = new Map<number, Set<number>>()
    for (const s of allStats) {
      const pos = posById.get(s.player_id)
      const fp = pos ? playerFantasyPoints(s, pos) : 0
      const stage = stageOf.get(s.fixture_id) ?? 'GROUP'
      const k = totalsKey(s.player_id, stage)
      const cur = stageTotals.get(k) ?? { fantasy: 0, goals: 0 }
      cur.fantasy += fp
      cur.goals += s.goals
      stageTotals.set(k, cur)
      if (s.goals > 0) {
        if (!scorersByFixture.has(s.fixture_id)) scorersByFixture.set(s.fixture_id, new Set())
        scorersByFixture.get(s.fixture_id)!.add(s.player_id)
      }
    }

    // --- 2. predictions ---
    const fxById = new Map<number, any>(allFixtures.map((f: any) => [f.id, f]))
    const { data: preds } = await db.from('predictions').select('*')
    const predUpdates: any[] = []
    for (const p of preds ?? []) {
      const f = fxById.get(p.fixture_id)
      if (!f || !f.finished || f.score_a == null || f.score_b == null) continue
      const pts = scorePrediction(p as Prediction, {
        score_a: f.score_a,
        score_b: f.score_b,
        had_red_card: f.had_red_card,
        scorerIds: scorersByFixture.get(p.fixture_id) ?? new Set(),
      })
      if (pts !== p.points) predUpdates.push({ ...p, points: pts })
    }
    if (predUpdates.length) await chunkedUpsert(db, 'predictions', predUpdates, 'id')

    // --- 3. squads (captain x2 + differential bonus, per stage) ---
    const { data: squads } = await db.from('squads').select('id, user_id, stage, budget_used')
    const { data: sps } = await db.from('squad_players').select('squad_id, player_id, is_captain')
    const playersBySquad = new Map<string, { player_id: number; is_captain: boolean }[]>()
    for (const sp of sps ?? []) {
      if (!playersBySquad.has(sp.squad_id)) playersBySquad.set(sp.squad_id, [])
      playersBySquad.get(sp.squad_id)!.push(sp)
    }
    const squadsByStage = new Map<string, any[]>()
    for (const sq of squads ?? []) {
      if (!squadsByStage.has(sq.stage)) squadsByStage.set(sq.stage, [])
      squadsByStage.get(sq.stage)!.push(sq)
    }

    const squadUpdates: any[] = []
    for (const [stage, stageSquads] of squadsByStage) {
      const ownership = new Map<number, number>()
      for (const sq of stageSquads)
        for (const sp of playersBySquad.get(sq.id) ?? [])
          ownership.set(sp.player_id, (ownership.get(sp.player_id) ?? 0) + 1)
      const n = stageSquads.length || 1
      for (const sq of stageSquads) {
        let total = 0
        for (const sp of playersBySquad.get(sq.id) ?? []) {
          const t = stageTotals.get(totalsKey(sp.player_id, stage)) ?? { fantasy: 0, goals: 0 }
          total += t.fantasy
          if (sp.is_captain) total += t.fantasy
          if ((ownership.get(sp.player_id) ?? 0) / n < DIFFERENTIAL_THRESHOLD)
            total += DIFFERENTIAL_BONUS_PER_GOAL * t.goals
        }
        squadUpdates.push({ ...sq, fantasy_points: Math.round(total) })
      }
    }
    if (squadUpdates.length) await chunkedUpsert(db, 'squads', squadUpdates, 'id')

    // --- 4. bracket ---
    const deepest = new Map<number, number>()
    for (const f of allFixtures) {
      const o = STAGE_ORDER[f.stage] ?? 0
      for (const t of [f.team_a, f.team_b])
        if (t != null) deepest.set(t, Math.max(deepest.get(t) ?? 0, o))
    }
    const finalFx = allFixtures.find((f: any) => f.stage === 'FINAL' && f.finished)
    let champion: number | null = null
    if (finalFx && finalFx.score_a != null && finalFx.score_b != null) {
      champion =
        finalFx.score_a > finalFx.score_b
          ? finalFx.team_a
          : finalFx.score_b > finalFx.score_a
            ? finalFx.team_b
            : null
    }
    const goalsByPlayer = new Map<number, number>()
    for (const s of allStats) goalsByPlayer.set(s.player_id, (goalsByPlayer.get(s.player_id) ?? 0) + s.goals)
    let goldenBoot: number | null = null
    let maxGoals = 0
    for (const [pid, g] of goalsByPlayer) if (g > maxGoals) ((maxGoals = g), (goldenBoot = pid))

    const { data: bpicks } = await db
      .from('bracket_picks')
      .select('id, user_id, pick_type, team_id, player_id, points')
    const bracketUpdates: any[] = []
    for (const bp of bpicks ?? []) {
      const base = BRACKET_POINTS[bp.pick_type] ?? 0
      let pts = 0
      if (bp.pick_type === 'GOLDEN_BOOT') {
        if (maxGoals > 0 && bp.player_id === goldenBoot) pts = base
      } else if (bp.pick_type === 'CHAMPION') {
        if (champion != null && bp.team_id === champion) pts = base
      } else {
        const lvl = REACH_LEVEL[bp.pick_type]
        if (lvl && bp.team_id != null && (deepest.get(bp.team_id) ?? 0) >= lvl) pts = base
      }
      if (pts !== bp.points) bracketUpdates.push({ ...bp, points: pts })
    }
    if (bracketUpdates.length) await chunkedUpsert(db, 'bracket_picks', bracketUpdates, 'id')

    return NextResponse.json({
      ok: true,
      predsScored: predUpdates.length,
      squadsScored: squadUpdates.length,
      bracketScored: bracketUpdates.length,
      champion,
      goldenBoot,
      maxGoals,
    })
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 })
  }
}
