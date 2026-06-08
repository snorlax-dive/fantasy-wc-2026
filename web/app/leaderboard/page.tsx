import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { RelativeTime } from '@/components/countdown'

export const dynamic = 'force-dynamic'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = {
  user_id: string
  display_name: string
  prediction_points: number
  fantasy_points: number
  bracket_points: number
  total_points: number
}

function Move({ delta }: { delta: number | null }) {
  if (delta === null) return <span className="text-[10px] font-bold text-cro-blue" title="new entry">NEW</span>
  if (delta > 0) return <span className="text-[11px] font-bold text-emerald-600" title={`up ${delta}`}>▲{delta}</span>
  if (delta < 0) return <span className="text-[11px] font-bold text-cro-red" title={`down ${-delta}`}>▼{-delta}</span>
  return <span className="text-[11px] text-slate-300" title="no change">–</span>
}

export default async function LeaderboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data, error } = await supabase.rpc('get_leaderboard')
  const rows = (data ?? []) as Row[]
  const { data: settingsRows } = await supabase.from('settings').select('key, value')
  const settings = Object.fromEntries((settingsRows ?? []).map((r: any) => [r.key, r.value]))
  const lastScored = typeof settings['last_scored_at'] === 'string' ? settings['last_scored_at'] : null
  const baseline = (settings['standings_baseline'] as Record<string, number> | undefined) ?? null
  const { data: profs } = await supabase.from('profiles').select('id, team_name, crest, color')
  const idById = new Map(
    (profs ?? []).map((p) => [p.id as string, p as { team_name: string | null; crest: string | null; color: string | null }])
  )

  // --- League banter stats (player_match_stats and revealed blocks are public via RLS) ---
  const [{ data: topHaul }, { data: revealedBlocks }] = await Promise.all([
    supabase.from('player_match_stats').select('player_id, fantasy_points').order('fantasy_points', { ascending: false }).limit(1),
    supabase.from('blocks').select('player_id').eq('revealed', true),
  ])
  const blockCounts = new Map<number, number>()
  for (const b of revealedBlocks ?? []) blockCounts.set(b.player_id, (blockCounts.get(b.player_id) ?? 0) + 1)
  let mostBlocked: { player_id: number; n: number } | null = null
  for (const [pid, n] of blockCounts) if (!mostBlocked || n > mostBlocked.n) mostBlocked = { player_id: pid, n }
  const haul = (topHaul ?? [])[0] as { player_id: number; fantasy_points: number } | undefined
  const statPlayerIds = [...new Set([haul?.player_id, mostBlocked?.player_id].filter((x): x is number => x != null))]
  const playerNames = new Map<number, string>()
  if (statPlayerIds.length) {
    const { data: pl } = await supabase.from('players').select('id, name').in('id', statPlayerIds)
    for (const p of pl ?? []) playerNames.set(p.id as number, p.name as string)
  }
  const hasStats = (haul?.fantasy_points ?? 0) > 0 || mostBlocked !== null

  // --- Rival tracker: who's directly above/below you ---
  const nameOf = (r: Row) => idById.get(r.user_id)?.team_name || r.display_name
  const myIndex = rows.findIndex((r) => r.user_id === user.id)
  const me = myIndex >= 0 ? rows[myIndex] : null
  const above = myIndex > 0 ? rows[myIndex - 1] : null
  const below = myIndex >= 0 && myIndex < rows.length - 1 ? rows[myIndex + 1] : null

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-5 pb-24 sm:pb-10">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-extrabold text-cro-navy">Leaderboard</h1>
        {lastScored && (
          <span className="text-xs text-slate-400">
            Updated <RelativeTime iso={lastScored} />
          </span>
        )}
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error.message}</p>}

      {/* Rival tracker */}
      {me && rows.length > 1 && (
        <section className="mt-4 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-cro-navy/15">
          <h2 className="border-b border-slate-100 bg-cro-navy px-4 py-2 text-sm font-bold text-white">⚔️ Your race</h2>
          <div className="divide-y divide-slate-100">
            {above ? (
              <div className="flex items-center gap-2 px-4 py-2 text-sm">
                <span className="w-6 text-center text-slate-400">{myIndex}</span>
                <span className="flex-1 truncate text-slate-600">{nameOf(above)}</span>
                <span className="text-xs font-bold text-cro-red">{above.total_points - me.total_points} ahead</span>
              </div>
            ) : (
              <div className="px-4 py-2 text-sm font-semibold text-emerald-600">👑 You&apos;re top of the table</div>
            )}
            <div className="flex items-center gap-2 bg-red-50 px-4 py-2.5 text-sm">
              <span className="w-6 text-center font-bold text-cro-navy">{myIndex + 1}</span>
              <span className="flex-1 truncate font-extrabold text-cro-navy">{nameOf(me)} <span className="text-xs font-bold text-cro-red">you</span></span>
              <span className="font-extrabold tabular-nums text-cro-navy">{me.total_points}</span>
            </div>
            {below && (
              <div className="flex items-center gap-2 px-4 py-2 text-sm">
                <span className="w-6 text-center text-slate-400">{myIndex + 2}</span>
                <span className="flex-1 truncate text-slate-600">{nameOf(below)}</span>
                <span className="text-xs font-bold text-emerald-600">{me.total_points - below.total_points} behind</span>
              </div>
            )}
          </div>
        </section>
      )}

      <div className="mt-4 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-3 py-2 text-left">#</th>
              <th className="px-3 py-2 text-left">Manager</th>
              <th className="px-2 py-2 text-right">Pred</th>
              <th className="px-2 py-2 text-right">Fan</th>
              <th className="px-2 py-2 text-right">Brkt</th>
              <th className="px-3 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r, i) => (
              <tr key={r.user_id} className={r.user_id === user.id ? 'bg-red-50' : ''}>
                <td className="px-3 py-2.5 font-bold text-slate-400">
                  <div className="flex items-center gap-1.5">
                    <span>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</span>
                    {baseline && (
                      <Move delta={baseline[r.user_id] != null ? baseline[r.user_id] - (i + 1) : null} />
                    )}
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-sm text-white"
                      style={{ backgroundColor: idById.get(r.user_id)?.color ?? '#94a3b8' }}
                    >
                      {idById.get(r.user_id)?.crest ?? '⚽'}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-cro-navy">
                        {idById.get(r.user_id)?.team_name || r.display_name}
                        {r.user_id === user.id && <span className="ml-1 text-xs font-bold text-cro-red">you</span>}
                      </div>
                      {idById.get(r.user_id)?.team_name && (
                        <div className="truncate text-[11px] text-slate-400">{r.display_name}</div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-2 py-2.5 text-right tabular-nums text-slate-500">{r.prediction_points}</td>
                <td className="px-2 py-2.5 text-right tabular-nums text-slate-500">{r.fantasy_points}</td>
                <td className="px-2 py-2.5 text-right tabular-nums text-slate-500">{r.bracket_points}</td>
                <td className="px-3 py-2.5 text-right text-base font-extrabold tabular-nums text-cro-navy">
                  {r.total_points}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-sm text-slate-400">
                  No scores yet — points appear once matches are played.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {baseline && (
        <p className="mt-2 text-center text-[11px] text-slate-400">▲▼ shows movement since the last round started</p>
      )}

      {/* League stats */}
      {hasStats && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          {haul && haul.fantasy_points > 0 && (
            <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">🔥 Biggest haul</div>
              <div className="mt-1 truncate font-bold text-cro-navy">{playerNames.get(haul.player_id) ?? 'Player'}</div>
              <div className="text-sm font-extrabold text-cro-blue">{haul.fantasy_points} pts</div>
            </div>
          )}
          {mostBlocked && (
            <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">🛡️ Most blocked</div>
              <div className="mt-1 truncate font-bold text-cro-navy">{playerNames.get(mostBlocked.player_id) ?? 'Player'}</div>
              <div className="text-sm font-extrabold text-cro-red">{mostBlocked.n}× blocked</div>
            </div>
          )}
        </div>
      )}
    </main>
  )
}
