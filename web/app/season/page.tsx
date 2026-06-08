import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAll } from '@/lib/supabase/fetchAll'

export const dynamic = 'force-dynamic'

/* eslint-disable @typescript-eslint/no-explicit-any */
const STAGE_ORDER = ['GROUP', 'R32', 'R16', 'QF', 'SF', 'FINAL']
const STAGE_LABEL: Record<string, string> = {
  GROUP: 'Group',
  R32: 'R32',
  R16: 'R16',
  QF: 'QF',
  SF: 'SF',
  FINAL: 'Final',
}

export default async function SeasonPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const [{ data: fixtures }, { data: squads }, { data: profs }, { data: lb }] = await Promise.all([
    supabase.from('fixtures').select('id, stage, finished'),
    admin.from('squads').select('user_id, stage, fantasy_points'),
    supabase.from('profiles').select('id'),
    supabase.rpc('get_leaderboard'),
  ])
  const preds = await fetchAll((from, to) =>
    admin.from('predictions').select('user_id, points, fixture_id').range(from, to)
  )

  const stageOfFx = new Map<number, string>((fixtures ?? []).map((f: any) => [f.id, f.stage]))
  const playedStages = STAGE_ORDER.filter((s) => (fixtures ?? []).some((f: any) => f.stage === s && f.finished))

  const squadByUserStage = new Map<string, number>()
  for (const s of squads ?? []) squadByUserStage.set(`${s.user_id}:${s.stage}`, s.fantasy_points)
  const predByUserStage = new Map<string, number>()
  for (const p of preds) {
    const st = stageOfFx.get(p.fixture_id)
    if (!st) continue
    predByUserStage.set(`${p.user_id}:${st}`, (predByUserStage.get(`${p.user_id}:${st}`) ?? 0) + (p.points ?? 0))
  }

  const users = (profs ?? []).map((p: any) => p.id as string)
  const cumulative = new Map<string, number>(users.map((u) => [u, 0]))
  const myRounds: { stage: string; squad: number; pred: number; total: number; rank: number }[] = []

  for (const stage of playedStages) {
    for (const u of users) {
      const sp = (squadByUserStage.get(`${u}:${stage}`) ?? 0) + (predByUserStage.get(`${u}:${stage}`) ?? 0)
      cumulative.set(u, (cumulative.get(u) ?? 0) + sp)
    }
    const ranked = [...cumulative.entries()].sort((a, b) => b[1] - a[1])
    const rank = ranked.findIndex(([u]) => u === user.id) + 1
    const mySquad = squadByUserStage.get(`${user.id}:${stage}`) ?? 0
    const myPred = predByUserStage.get(`${user.id}:${stage}`) ?? 0
    myRounds.push({ stage, squad: mySquad, pred: myPred, total: mySquad + myPred, rank })
  }

  // Season summary
  const me = ((lb ?? []) as any[]).find((r) => r.user_id === user.id)
  const myLbRank = ((lb ?? []) as any[]).findIndex((r) => r.user_id === user.id) + 1
  const myPredsAll = preds.filter((p) => p.user_id === user.id)
  const predScored = myPredsAll.filter((p) => (p.points ?? 0) > 0).length
  const best = myRounds.reduce<typeof myRounds[number] | null>((acc, r) => (!acc || r.total > acc.total ? r : acc), null)
  const maxRound = Math.max(1, ...myRounds.map((r) => r.total))

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-5 pb-24 sm:pb-10">
      <h1 className="text-xl font-extrabold text-cro-navy">Your season</h1>

      {/* Summary */}
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <Stat label="Total" value={me?.total_points ?? 0} accent />
        <Stat label="Rank" value={myLbRank > 0 ? myLbRank : 0} />
        <Stat label="Best round" value={best?.total ?? 0} />
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-center">
        <Stat label="Squad" value={me?.fantasy_points ?? 0} />
        <Stat label="Predict" value={me?.prediction_points ?? 0} />
        <Stat label="Bracket" value={me?.bracket_points ?? 0} />
      </div>

      {/* Per-round form */}
      <section className="mt-4 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        <h2 className="border-b border-slate-100 px-4 py-2 text-sm font-bold text-cro-navy">Round by round</h2>
        {myRounds.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-slate-400">No completed rounds yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {myRounds.map((r) => (
              <li key={r.stage} className="px-4 py-2.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold text-cro-navy">{STAGE_LABEL[r.stage] ?? r.stage}</span>
                  <span className="text-xs text-slate-400">
                    rank {r.rank} · <span className="text-slate-500">{r.squad}</span> squad + <span className="text-slate-500">{r.pred}</span> pred
                  </span>
                  <span className="font-extrabold tabular-nums text-cro-navy">{r.total}</span>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-cro-red" style={{ width: `${Math.round((r.total / maxRound) * 100)}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-3 text-center text-sm text-slate-500">
        Prediction accuracy: <span className="font-bold text-cro-navy">{predScored}</span> of{' '}
        <span className="font-bold text-cro-navy">{myPredsAll.length}</span> scored
      </p>
    </main>
  )
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className={`rounded-2xl p-3 shadow-sm ring-1 ${accent ? 'bg-cro-navy text-white ring-cro-navy' : 'bg-white text-cro-navy ring-slate-200'}`}>
      <div className={`text-[11px] ${accent ? 'text-white/70' : 'text-slate-400'}`}>{label}</div>
      <div className="text-xl font-extrabold tabular-nums">{value}</div>
    </div>
  )
}
