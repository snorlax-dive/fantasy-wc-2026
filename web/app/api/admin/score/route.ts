import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetchAll'
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
  if (!(await authorized(req))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const db = createAdminClient()

  try {
    const [{ data: fixtures }, { data: settingsRows }] = await Promise.all([
      db
        .from('fixtures')
        .select('id, stage, score_a, score_b, had_red_card, finished, team_a, team_b, lock_time'),
      db.from('settings').select('key, value'),
    ])
    // These can exceed 1000 rows — page through all of them.
    const players = await fetchAll((from, to) => db.from('players').select('id, position').range(from, to))
    const stats = await fetchAll((from, to) => db.from('player_match_stats').select('*').range(from, to))
    const settings = Object.fromEntries((settingsRows ?? []).map((r: any) => [r.key, r.value]))
    const perTargetCap = Number(settings['block_per_target_cap'] ?? 2)
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
    const preds = await fetchAll((from, to) => db.from('predictions').select('*').range(from, to))
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

    // --- reveal blocks for locked stages, then load active blocks + shields ---
    const now = Date.now()
    const stageLock = new Map<string, number>()
    for (const f of allFixtures) {
      const t = new Date(f.lock_time).getTime()
      const cur = stageLock.get(f.stage)
      if (cur == null || t < cur) stageLock.set(f.stage, t)
    }
    const lockedStages = [...stageLock.entries()].filter(([, t]) => t <= now).map(([s]) => s)
    if (lockedStages.length) {
      await db.from('blocks').update({ revealed: true }).in('stage', lockedStages).eq('revealed', false)
    }
    const { data: blocks } = await db
      .from('blocks')
      .select('stage, target, player_id, committed_at')
      .eq('revealed', true)
    const { data: shields } = await db.from('shield_uses').select('user_id, stage')
    const shieldSet = new Set<string>((shields ?? []).map((s: any) => `${s.user_id}:${s.stage}`))
    const blocksByTarget = new Map<string, { player_id: number; committed_at: string }[]>()
    for (const b of blocks ?? []) {
      const k = `${b.target}:${b.stage}`
      if (!blocksByTarget.has(k)) blocksByTarget.set(k, [])
      blocksByTarget.get(k)!.push({ player_id: b.player_id, committed_at: b.committed_at })
    }
    const blockedFor = (userId: string, stage: string): Set<number> => {
      if (shieldSet.has(`${userId}:${stage}`)) return new Set() // shield = full protection this round
      const arr = (blocksByTarget.get(`${userId}:${stage}`) ?? [])
        .slice()
        .sort((a, b) => a.committed_at.localeCompare(b.committed_at))
        .slice(0, perTargetCap) // only the first N blocks land; extras bounce
      return new Set(arr.map((x) => x.player_id))
    }

    // --- 3. squads (captain x2 + differential bonus + blocks, per stage) ---
    const { data: squads } = await db.from('squads').select('id, user_id, stage, budget_used')
    const sps = await fetchAll((from, to) =>
      db.from('squad_players').select('squad_id, player_id, is_captain').range(from, to)
    )
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
        const blocked = blockedFor(sq.user_id, stage)
        let total = 0
        for (const sp of playersBySquad.get(sq.id) ?? []) {
          if (blocked.has(sp.player_id)) continue // blocked → 0 (incl. captain & differential)
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
