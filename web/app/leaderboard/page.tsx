import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type Row = {
  user_id: string
  display_name: string
  prediction_points: number
  fantasy_points: number
  bracket_points: number
  total_points: number
}

export default async function LeaderboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data, error } = await supabase.rpc('get_leaderboard')
  const rows = (data ?? []) as Row[]

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-5 pb-24 sm:pb-10">
      <h1 className="text-xl font-extrabold text-cro-navy">Leaderboard</h1>

      {error && <p className="mt-4 text-sm text-red-600">{error.message}</p>}

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
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                </td>
                <td className="px-3 py-2.5 font-semibold text-cro-navy">
                  {r.display_name}
                  {r.user_id === user.id && <span className="ml-1 text-xs font-bold text-cro-red">you</span>}
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
    </main>
  )
}
