import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAll } from '@/lib/supabase/fetchAll'

export const dynamic = 'force-dynamic'

/* eslint-disable @typescript-eslint/no-explicit-any */
export default async function AchievementsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // My squads + players (own-row reads, public tables — all readable without admin)
  const { data: mySquads } = await supabase.from('squads').select('id, stage').eq('user_id', user.id)
  const squadStage = new Map<string, string>((mySquads ?? []).map((s: any) => [s.id, s.stage]))
  const squadIds = (mySquads ?? []).map((s: any) => s.id)
  const { data: sps } = await supabase
    .from('squad_players')
    .select('squad_id, player_id, is_captain')
    .in('squad_id', squadIds.length ? squadIds : ['00000000-0000-0000-0000-000000000000'])
  const myPlayerIds = [...new Set((sps ?? []).map((s: any) => s.player_id))]
  const captainByStage = new Map<string, number>()
  for (const sp of sps ?? []) if (sp.is_captain) captainByStage.set(squadStage.get(sp.squad_id) ?? '', sp.player_id)

  const [{ data: players }, { data: fixtures }, { data: preds }, { data: blocks }, { data: settingsRows }, { data: lb }] =
    await Promise.all([
      supabase.from('players').select('id, position').in('id', myPlayerIds.length ? myPlayerIds : [-1]),
      supabase.from('fixtures').select('id, stage'),
      supabase.from('predictions').select('is_banker, points').eq('user_id', user.id),
      supabase.from('blocks').select('player_id, target, stage').eq('blocker', user.id).eq('revealed', true),
      supabase.from('settings').select('key, value'),
      supabase.rpc('get_leaderboard'),
    ])
  const myStats = await fetchAll((from, to) =>
    supabase
      .from('player_match_stats')
      .select('player_id, fixture_id, goals, clean_sheet, fantasy_points, minutes')
      .in('player_id', myPlayerIds.length ? myPlayerIds : [-1])
      .range(from, to)
  )

  const posBy = new Map<number, string>((players ?? []).map((p: any) => [p.id, p.position]))
  const stageOfFx = new Map<number, string>((fixtures ?? []).map((f: any) => [f.id, f.stage]))

  // Captain Fantastic: a stage captain's total ≥ 8
  let captainFantastic = false
  for (const [stage, pid] of captainByStage) {
    const total = myStats
      .filter((s: any) => s.player_id === pid && stageOfFx.get(s.fixture_id) === stage)
      .reduce((a: number, s: any) => a + s.fantasy_points, 0)
    if (total >= 8) captainFantastic = true
  }

  const wall = myStats.some(
    (s: any) => ['GK', 'DEF'].includes(posBy.get(s.player_id) ?? '') && s.clean_sheet && s.minutes >= 60
  )
  const hatTrick = myStats.some((s: any) => s.goals >= 3)
  const bigHauler = myStats.some((s: any) => s.fantasy_points >= 12)
  const bullseye = (preds ?? []).some((p: any) => p.is_banker && (p.points ?? 0) > 0)

  // Sniper: a block landed
  let sniper = false
  if ((blocks ?? []).length) {
    const targetIds = [...new Set((blocks ?? []).map((b: any) => b.target))]
    // Cross-user squads and shield_uses are restricted by RLS — admin required.
    const admin = createAdminClient()
    const [{ data: tSquads }, { data: tShields }] = await Promise.all([
      admin.from('squads').select('id, user_id, stage').in('user_id', targetIds),
      admin.from('shield_uses').select('user_id, stage').in('user_id', targetIds),
    ])
    const shieldSet = new Set((tShields ?? []).map((s: any) => `${s.user_id}:${s.stage}`))
    const sqOf = new Map((tSquads ?? []).map((s: any) => [`${s.user_id}:${s.stage}`, s.id]))
    const sqIds = (tSquads ?? []).map((s: any) => s.id)
    const { data: tsp } = await admin
      .from('squad_players')
      .select('squad_id, player_id')
      .in('squad_id', sqIds.length ? sqIds : ['00000000-0000-0000-0000-000000000000'])
    const ownBySquad = new Map<string, Set<number>>()
    for (const sp of tsp ?? []) {
      if (!ownBySquad.has(sp.squad_id)) ownBySquad.set(sp.squad_id, new Set())
      ownBySquad.get(sp.squad_id)!.add(sp.player_id)
    }
    sniper = (blocks ?? []).some((b: any) => {
      if (shieldSet.has(`${b.target}:${b.stage}`)) return false
      const sid = sqOf.get(`${b.target}:${b.stage}`)
      return sid ? ownBySquad.get(sid)?.has(b.player_id) ?? false : false
    })
  }

  // Standings-based
  const settings = Object.fromEntries((settingsRows ?? []).map((r: any) => [r.key, r.value]))
  const baseline = (settings['standings_baseline'] as Record<string, number> | undefined) ?? null
  const rows = (lb ?? []) as any[]
  const myRank = rows.findIndex((r) => r.user_id === user.id) + 1
  const me = rows.find((r) => r.user_id === user.id)
  const topDog = myRank === 1 && (me?.total_points ?? 0) > 0
  const greenArrow = Boolean(baseline && baseline[user.id] != null && myRank > 0 && myRank < baseline[user.id])

  const badges = [
    { emoji: '🎯', title: 'Bullseye', desc: 'Land a banker prediction', earned: bullseye },
    { emoji: '🧱', title: 'The Wall', desc: 'Own a defender who kept a clean sheet', earned: wall },
    { emoji: '🎩', title: 'Hat-trick Hero', desc: 'Own a player who scored 3+ in a match', earned: hatTrick },
    { emoji: '🔥', title: 'Big Hauler', desc: 'Own a 12+ point single-match performance', earned: bigHauler },
    { emoji: '©️', title: 'Captain Fantastic', desc: 'Your captain returned 8+ in a round', earned: captainFantastic },
    { emoji: '🔫', title: 'Sniper', desc: 'Land a block on a rival', earned: sniper },
    { emoji: '👑', title: 'Top Dog', desc: 'Sit top of the table', earned: topDog },
    { emoji: '📈', title: 'Green Arrow', desc: 'Climb the table during a round', earned: greenArrow },
  ]
  const earnedCount = badges.filter((b) => b.earned).length

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-5 pb-24 sm:pb-10">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-extrabold text-cro-navy">Achievements</h1>
        <span className="rounded-full bg-cro-navy px-3 py-1 text-xs font-bold text-white">{earnedCount}/{badges.length}</span>
      </div>
      <p className="mt-1 text-sm text-slate-500">Unlock these as the tournament unfolds.</p>

      <div className="mt-4 grid grid-cols-2 gap-3">
        {badges.map((b) => (
          <div
            key={b.title}
            className={`rounded-2xl p-4 text-center shadow-sm ring-1 ${b.earned ? 'bg-white ring-amber-300' : 'bg-slate-50 ring-slate-200'}`}
          >
            <div className={`text-3xl ${b.earned ? '' : 'opacity-30 grayscale'}`}>{b.emoji}</div>
            <div className={`mt-1 font-extrabold ${b.earned ? 'text-cro-navy' : 'text-slate-400'}`}>{b.title}</div>
            <div className="mt-0.5 text-[11px] text-slate-400">{b.desc}</div>
            {b.earned && <div className="mt-1 text-[11px] font-bold text-amber-600">UNLOCKED</div>}
          </div>
        ))}
      </div>
    </main>
  )
}
