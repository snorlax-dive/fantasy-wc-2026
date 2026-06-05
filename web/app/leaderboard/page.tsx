import { redirect } from 'next/navigation'
import Link from 'next/link'
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
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-2xl px-4 py-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Leaderboard</h1>
          <Link href="/" className="text-sm text-zinc-400 hover:text-zinc-200">
            ← Home
          </Link>
        </div>

        {error && <p className="mt-4 text-sm text-red-400">{error.message}</p>}

        <div className="mt-4 overflow-hidden rounded-xl border border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900/60 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2 text-left">#</th>
                <th className="px-3 py-2 text-left">Manager</th>
                <th className="px-2 py-2 text-right">Pred</th>
                <th className="px-2 py-2 text-right">Fantasy</th>
                <th className="px-2 py-2 text-right">Bracket</th>
                <th className="px-3 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-900">
              {rows.map((r, i) => (
                <tr key={r.user_id} className={r.user_id === user.id ? 'bg-emerald-950/20' : ''}>
                  <td className="px-3 py-2 text-zinc-500">{i + 1}</td>
                  <td className="px-3 py-2 font-medium">
                    {r.display_name}
                    {r.user_id === user.id && <span className="ml-1 text-xs text-emerald-400">(you)</span>}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-zinc-400">{r.prediction_points}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-zinc-400">{r.fantasy_points}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-zinc-400">{r.bracket_points}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{r.total_points}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-sm text-zinc-500">
                    No scores yet — points appear once matches are played.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  )
}
