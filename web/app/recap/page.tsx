import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ShareCard } from './share-card'

export const dynamic = 'force-dynamic'

/* eslint-disable @typescript-eslint/no-explicit-any */
const STAGE_LABEL: Record<string, string> = {
  GROUP: 'Group stage',
  R32: 'Round of 32',
  R16: 'Round of 16',
  QF: 'Quarter-finals',
  SF: 'Semi-finals',
  FINAL: 'Final',
}

export default async function RecapPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Pick the most recently played round (latest kickoff among finished fixtures).
  const { data: finishedFx } = await supabase
    .from('fixtures')
    .select('id, stage, kickoff')
    .eq('finished', true)
    .order('kickoff', { ascending: false })

  if (!finishedFx || finishedFx.length === 0) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-5 pb-24 sm:pb-10">
        <h1 className="text-xl font-extrabold text-cro-navy">Your round recap</h1>
        <div className="mt-4 rounded-2xl bg-white p-6 text-center text-sm text-slate-500 shadow-sm ring-1 ring-slate-200">
          No completed rounds yet — your recap appears once matches are played.
        </div>
      </main>
    )
  }

  const stage = finishedFx[0].stage as string
  const stageFxIds = finishedFx.filter((f: any) => f.stage === stage).map((f: any) => f.id)

  const settings = Object.fromEntries(
    ((await supabase.from('settings').select('key, value')).data ?? []).map((r: any) => [r.key, r.value])
  )
  const capMult = Number(settings['captain_multiplier'] ?? 2)

  // ----- squad -----
  const { data: squad } = await supabase
    .from('squads')
    .select('id, fantasy_points')
    .eq('user_id', user.id)
    .eq('stage', stage)
    .maybeSingle()

  let players: { id: number; name: string; position: string; pts: number; captain: boolean; blocked: boolean }[] = []
  const squadTotal = squad?.fantasy_points ?? 0
  let tcUsed = false

  if (squad?.id) {
    const { data: sps } = await supabase.from('squad_players').select('player_id, is_captain').eq('squad_id', squad.id)
    const pids = (sps ?? []).map((s: any) => s.player_id)
    const captainOf = new Map((sps ?? []).map((s: any) => [s.player_id, s.is_captain]))

    // players/pms/chip_uses/own blocks/own shields all readable via RLS without admin.
    const [{ data: pl }, { data: stats }, { data: tc }, { data: blocksOnMe }, { data: myShield }] = await Promise.all([
      supabase.from('players').select('id, name, position').in('id', pids.length ? pids : [-1]),
      supabase
        .from('player_match_stats')
        .select('player_id, fantasy_points')
        .in('fixture_id', stageFxIds.length ? stageFxIds : [-1])
        .in('player_id', pids.length ? pids : [-1]),
      supabase.from('chip_uses').select('stage').eq('user_id', user.id).eq('chip', 'TRIPLE_CAPTAIN').eq('stage', stage),
      supabase.from('blocks').select('player_id').eq('target', user.id).eq('stage', stage).eq('revealed', true),
      supabase.from('shield_uses').select('stage').eq('user_id', user.id).eq('stage', stage).maybeSingle(),
    ])
    tcUsed = (tc ?? []).length > 0
    const shielded = Boolean(myShield)
    const blockedSet = new Set<number>(shielded ? [] : (blocksOnMe ?? []).map((b: any) => b.player_id))

    const ptsBy = new Map<number, number>()
    for (const s of stats ?? []) ptsBy.set(s.player_id, (ptsBy.get(s.player_id) ?? 0) + s.fantasy_points)
    const nameBy = new Map((pl ?? []).map((p: any) => [p.id, p]))
    players = pids.map((pid: number) => ({
      id: pid,
      name: (nameBy.get(pid) as any)?.name ?? 'Player',
      position: (nameBy.get(pid) as any)?.position ?? '',
      pts: ptsBy.get(pid) ?? 0,
      captain: Boolean(captainOf.get(pid)),
      blocked: blockedSet.has(pid),
    }))
    const order: Record<string, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 }
    players.sort((a, b) => (order[a.position] ?? 9) - (order[b.position] ?? 9) || b.pts - a.pts)
  }

  // ----- predictions -----
  const { data: preds } = await supabase
    .from('predictions')
    .select('fixture_id, points, is_banker')
    .eq('user_id', user.id)
    .in('fixture_id', stageFxIds.length ? stageFxIds : [-1])
  const predPts = (preds ?? []).reduce((a: number, p: any) => a + (p.points ?? 0), 0)
  const predScored = (preds ?? []).filter((p: any) => (p.points ?? 0) > 0).length

  // ----- my blocks (did they land?) -----
  // Own revealed blocks are readable via RLS; cross-user squads/shields below need admin.
  const { data: myBlocks } = await supabase
    .from('blocks')
    .select('player_id, target')
    .eq('blocker', user.id)
    .eq('stage', stage)
    .eq('revealed', true)
  let blockResults: { player: string; target: string; landed: boolean }[] = []
  if ((myBlocks ?? []).length) {
    const targetIds = [...new Set((myBlocks ?? []).map((b: any) => b.target))]
    const admin = createAdminClient()
    const [{ data: tSquads }, { data: tProfiles }, { data: tShields }] = await Promise.all([
      admin.from('squads').select('id, user_id').eq('stage', stage).in('user_id', targetIds),
      supabase.from('profiles').select('id, team_name, display_name').in('id', targetIds),
      admin.from('shield_uses').select('user_id').eq('stage', stage).in('user_id', targetIds),
    ])
    const userBySquad = new Map((tSquads ?? []).map((s: any) => [s.id, s.user_id]))
    const shieldedUsers = new Set((tShields ?? []).map((s: any) => s.user_id))
    const squadIds = (tSquads ?? []).map((s: any) => s.id)
    const { data: tSp } = await admin.from('squad_players').select('squad_id, player_id').in('squad_id', squadIds.length ? squadIds : [-1])
    const ownedBy = new Map<string, Set<number>>()
    for (const sp of tSp ?? []) {
      const u = userBySquad.get(sp.squad_id)
      if (!u) continue
      if (!ownedBy.has(u)) ownedBy.set(u, new Set())
      ownedBy.get(u)!.add(sp.player_id)
    }
    const allBlockPlayerIds = [...new Set((myBlocks ?? []).map((b: any) => b.player_id))]
    const { data: bpl } = await supabase.from('players').select('id, name').in('id', allBlockPlayerIds.length ? allBlockPlayerIds : [-1])
    const bpName = new Map((bpl ?? []).map((p: any) => [p.id, p.name]))
    const tName = new Map((tProfiles ?? []).map((p: any) => [p.id, p.team_name || p.display_name]))
    blockResults = (myBlocks ?? []).map((b: any) => ({
      player: bpName.get(b.player_id) ?? 'Player',
      target: tName.get(b.target) ?? 'Manager',
      landed: !shieldedUsers.has(b.target) && (ownedBy.get(b.target)?.has(b.player_id) ?? false),
    }))
  }

  const roundTotal = squadTotal + predPts

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-5 pb-24 sm:pb-10">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-extrabold text-cro-navy">Your round recap</h1>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-cro-navy px-3 py-1 text-xs font-bold text-white">{STAGE_LABEL[stage] ?? stage}</span>
          <ShareCard />
        </div>
      </div>

      {/* Headline */}
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <Stat label="Squad" value={squadTotal} accent />
        <Stat label="Predictions" value={predPts} />
        <Stat label="Round total" value={roundTotal} accent />
      </div>

      {/* Squad breakdown */}
      <section className="mt-4 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        <h2 className="border-b border-slate-100 px-4 py-2 text-sm font-bold text-cro-navy">
          ⚽ Your XI {tcUsed && <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">Triple Captain</span>}
        </h2>
        {players.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-slate-400">You didn&apos;t field a squad this round.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {players.map((p) => (
              <li key={p.id} className="flex items-center gap-2 px-4 py-2 text-sm">
                <span className="w-9 shrink-0 text-[11px] font-bold uppercase text-slate-400">{p.position}</span>
                <span className={`flex-1 truncate ${p.blocked ? 'text-slate-400 line-through' : 'text-cro-navy'}`}>
                  {p.name}
                  {p.captain && <span className="ml-1 rounded bg-amber-400 px-1 text-[10px] font-extrabold text-white">{tcUsed ? 'TC' : 'C'}</span>}
                  {p.blocked && <span className="ml-1 text-[10px] font-bold text-cro-red">BLOCKED</span>}
                </span>
                <span className="font-bold tabular-nums text-cro-navy">
                  {p.captain ? `${p.pts} ×${tcUsed ? 3 : capMult}` : p.pts}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="border-t border-slate-100 bg-slate-50 px-4 py-2 text-right text-xs text-slate-500">
          Squad total <span className="font-extrabold text-cro-navy">{squadTotal} pts</span> (incl. captain &amp; bonuses)
        </div>
      </section>

      {/* Predictions */}
      <section className="mt-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-sm font-bold text-cro-navy">🎯 Predictions</h2>
        <p className="mt-1 text-sm text-slate-600">
          {(preds ?? []).length === 0
            ? 'No predictions for this round.'
            : `${predScored} of ${(preds ?? []).length} predictions scored — ${predPts} pts.`}
        </p>
      </section>

      {/* Blocks */}
      {blockResults.length > 0 && (
        <section className="mt-4 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
          <h2 className="border-b border-slate-100 px-4 py-2 text-sm font-bold text-cro-navy">🛡️ Your blocks</h2>
          <ul className="divide-y divide-slate-100">
            {blockResults.map((b, i) => (
              <li key={i} className="flex items-center gap-2 px-4 py-2 text-sm">
                <span className="flex-1 truncate text-cro-navy">
                  {b.player} <span className="text-slate-400">on {b.target}</span>
                </span>
                <span className={`text-xs font-bold ${b.landed ? 'text-emerald-600' : 'text-slate-400'}`}>
                  {b.landed ? 'HIT ✓' : 'missed'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-6 text-center">
        <Link href="/leaderboard" className="text-sm font-semibold text-cro-red">See the full table →</Link>
      </div>
    </main>
  )
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className={`rounded-2xl p-3 shadow-sm ring-1 ${accent ? 'bg-cro-navy text-white ring-cro-navy' : 'bg-white text-cro-navy ring-slate-200'}`}>
      <div className={`text-[11px] ${accent ? 'text-white/70' : 'text-slate-400'}`}>{label}</div>
      <div className="text-2xl font-extrabold tabular-nums">{value}</div>
    </div>
  )
}
