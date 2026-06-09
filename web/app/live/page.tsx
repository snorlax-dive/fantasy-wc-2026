import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/* eslint-disable @typescript-eslint/no-explicit-any */
export default async function LivePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: settingsRows } = await supabase.from('settings').select('key, value')
  const settings = Object.fromEntries((settingsRows ?? []).map((r: any) => [r.key, r.value]))
  const stage = (settings['current_stage'] as string) ?? 'GROUP'
  const capMult = Number(settings['captain_multiplier'] ?? 2)

  // Live fixtures
  const { data: liveFx } = await supabase
    .from('fixtures')
    .select('id, team_a, team_b, score_a, score_b')
    .eq('status', 'LIVE')
  const liveIds = (liveFx ?? []).map((f: any) => f.id)
  const { data: teams } = await supabase.from('teams').select('id, name')
  const teamName = new Map<number, string>((teams ?? []).map((t: any) => [t.id, t.name]))
  // team_id -> the live fixture it's playing in
  const liveByTeam = new Map<number, any>()
  for (const f of liveFx ?? []) {
    if (f.team_a != null) liveByTeam.set(f.team_a, f)
    if (f.team_b != null) liveByTeam.set(f.team_b, f)
  }

  // My squad for the current stage
  const { data: squad } = await supabase
    .from('squads')
    .select('id')
    .eq('user_id', user.id)
    .eq('stage', stage)
    .maybeSingle()
  let xi: any[] = []
  let tcUsed = false
  if (squad?.id) {
    const { data: sps } = await supabase.from('squad_players').select('player_id, is_captain').eq('squad_id', squad.id)
    const pids = (sps ?? []).map((s: any) => s.player_id)
    const captainOf = new Map((sps ?? []).map((s: any) => [s.player_id, s.is_captain]))
    const [{ data: pl }, { data: stats }, { data: tc }] = await Promise.all([
      supabase.from('players').select('id, name, position, team_id').in('id', pids.length ? pids : [-1]),
      supabase
        .from('player_match_stats')
        .select('player_id, fantasy_points, goals, minutes')
        .in('fixture_id', liveIds.length ? liveIds : [-1])
        .in('player_id', pids.length ? pids : [-1]),
      supabase.from('chip_uses').select('stage').eq('user_id', user.id).eq('chip', 'TRIPLE_CAPTAIN').eq('stage', stage),
    ])
    tcUsed = (tc ?? []).length > 0
    const statBy = new Map<number, any>((stats ?? []).map((s: any) => [s.player_id, s]))
    const order: Record<string, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 }
    xi = (pl ?? [])
      .map((p: any) => {
        const fx = liveByTeam.get(p.team_id)
        const st = statBy.get(p.id)
        return {
          id: p.id,
          name: p.name,
          position: p.position,
          captain: Boolean(captainOf.get(p.id)),
          isLive: Boolean(fx),
          pts: st?.fantasy_points ?? 0,
          goals: st?.goals ?? 0,
          opp: fx
            ? `${teamName.get(fx.team_a) ?? '?'} ${fx.score_a ?? 0}-${fx.score_b ?? 0} ${teamName.get(fx.team_b) ?? '?'}`
            : null,
        }
      })
      .sort((a, b) => (order[a.position] ?? 9) - (order[b.position] ?? 9))
  }

  const mult = tcUsed ? 3 : capMult
  const liveTotal = xi.reduce((acc, p) => acc + (p.isLive ? p.pts * (p.captain ? mult : 1) : 0), 0)
  const livePlaying = xi.filter((p) => p.isLive).length

  // Provisional league rank (updated by the cron every ~10 min)
  const { data: lb } = await supabase.rpc('get_leaderboard')
  const myRank = ((lb ?? []) as any[]).findIndex((r) => r.user_id === user.id) + 1

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-5 pb-24 sm:pb-10">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-extrabold text-cro-navy">Live points</h1>
        {(liveFx ?? []).length > 0 && (
          <span className="flex items-center gap-1 rounded-full bg-red-50 px-2 py-1 text-xs font-bold text-cro-red ring-1 ring-red-200">
            <span className="h-2 w-2 animate-pulse rounded-full bg-cro-red" /> {(liveFx ?? []).length} live
          </span>
        )}
      </div>

      {(liveFx ?? []).length === 0 ? (
        <div className="mt-4 rounded-2xl bg-white p-6 text-center text-sm text-slate-500 shadow-sm ring-1 ring-slate-200">
          No live matches right now. Come back during a match to watch your points tick up.{' '}
          <Link href="/" className="font-semibold text-cro-red">See the schedule →</Link>
        </div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <Stat label="Live points" value={liveTotal} accent />
            <Stat label="Playing now" value={livePlaying} />
            <Stat label="Rank" value={myRank > 0 ? myRank : 0} />
          </div>

          {xi.length === 0 ? (
            <div className="mt-4 rounded-2xl bg-white p-6 text-center text-sm text-slate-500 shadow-sm ring-1 ring-slate-200">
              You don&apos;t have a squad for this round.
            </div>
          ) : (
            <section className="mt-4 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
              <h2 className="border-b border-slate-100 px-4 py-2 text-sm font-bold text-cro-navy">Your XI</h2>
              <ul className="divide-y divide-slate-100">
                {xi.map((p) => (
                  <li key={p.id} className={`flex items-center gap-2 px-4 py-2 text-sm ${p.isLive ? '' : 'opacity-60'}`}>
                    <span className="w-9 shrink-0 text-[11px] font-bold uppercase text-slate-400">{p.position}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold text-cro-navy">
                        {p.name}
                        {p.captain && <span className="ml-1 rounded bg-amber-400 px-1 text-[10px] font-extrabold text-white">{tcUsed ? 'TC' : 'C'}</span>}
                        {p.goals > 0 && <span className="ml-1">{'⚽'.repeat(Math.min(p.goals, 3))}</span>}
                      </div>
                      {p.opp ? (
                        <div className="truncate text-[11px] text-cro-red">🔴 {p.opp}</div>
                      ) : (
                        <div className="text-[11px] text-slate-400">not playing now</div>
                      )}
                    </div>
                    <span className="font-bold tabular-nums text-cro-navy">
                      {p.isLive ? (p.captain ? `${p.pts}×${mult}` : p.pts) : '—'}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <p className="mt-2 text-center text-[11px] text-slate-400">Provisional — final points are confirmed after each match.</p>
        </>
      )}
    </main>
  )
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className={`rounded-2xl p-3 shadow-sm ring-1 ${accent ? 'bg-cro-red text-white ring-cro-red' : 'bg-white text-cro-navy ring-slate-200'}`}>
      <div className={`text-[11px] ${accent ? 'text-white/80' : 'text-slate-400'}`}>{label}</div>
      <div className="text-2xl font-extrabold tabular-nums">{value || (accent ? 0 : '—')}</div>
    </div>
  )
}
