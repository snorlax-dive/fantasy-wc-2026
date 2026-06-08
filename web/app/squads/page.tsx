import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAll } from '@/lib/supabase/fetchAll'

export const dynamic = 'force-dynamic'

const STAGE_LABEL: Record<string, string> = {
  GROUP: 'Group stage',
  R32: 'Round of 32',
  R16: 'Round of 16',
  QF: 'Quarter-finals',
  SF: 'Semi-finals',
  FINAL: 'Final',
}
const POSES = ['GK', 'DEF', 'MID', 'FWD'] as const

/* eslint-disable @typescript-eslint/no-explicit-any */
export default async function SquadsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: settingsRows } = await admin.from('settings').select('key, value')
  const settings = Object.fromEntries((settingsRows ?? []).map((r: any) => [r.key, r.value]))
  const stage = (settings['current_stage'] as string) ?? 'GROUP'
  const stageLabel = STAGE_LABEL[stage] ?? stage

  const { data: firstFx } = await admin
    .from('fixtures')
    .select('kickoff')
    .eq('stage', stage)
    .order('kickoff', { ascending: true })
    .limit(1)
    .maybeSingle()
  const locked =
    settings['tournament_locked'] === true || (firstFx ? new Date(firstFx.kickoff) <= new Date() : false)

  if (!locked) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-5 pb-24 sm:pb-10">
        <h1 className="text-xl font-extrabold text-cro-navy">Squads</h1>
        <div className="mt-4 rounded-2xl bg-white p-6 text-center text-sm text-slate-500 shadow-sm ring-1 ring-slate-200">
          Everyone&apos;s squads stay secret until <span className="font-semibold text-cro-navy">{stageLabel}</span>{' '}
          kicks off. Check back once the round starts. 👀
        </div>
      </main>
    )
  }

  const { data: squads } = await admin
    .from('squads')
    .select('id, user_id, fantasy_points, budget_used')
    .eq('stage', stage)
  const squadIds = (squads ?? []).map((s: any) => s.id)
  const { data: sps } =
    squadIds.length > 0
      ? await admin.from('squad_players').select('squad_id, player_id, is_captain').in('squad_id', squadIds)
      : { data: [] as any[] }
  const { data: profs } = await admin.from('profiles').select('id, display_name, team_name, crest, color')
  const players = await fetchAll((from, to) =>
    admin.from('players').select('id, name, position, price, team:teams(name)').range(from, to)
  )

  const profById = new Map<string, any>((profs ?? []).map((p: any) => [p.id, p]))
  const playerById = new Map<number, any>(
    (players ?? []).map((p: any) => {
      const team = Array.isArray(p.team) ? p.team[0] : p.team
      return [p.id, { ...p, teamName: team?.name ?? '' }]
    })
  )
  const spBySquad = new Map<string, any[]>()
  for (const sp of sps ?? []) {
    if (!spBySquad.has(sp.squad_id)) spBySquad.set(sp.squad_id, [])
    spBySquad.get(sp.squad_id)!.push(sp)
  }

  const cards = (squads ?? [])
    .map((sq: any) => {
      const p = profById.get(sq.user_id)
      const sp = spBySquad.get(sq.id) ?? []
      const byPos: Record<string, any[]> = { GK: [], DEF: [], MID: [], FWD: [] }
      let captain = ''
      for (const row of sp) {
        const pl = playerById.get(row.player_id)
        if (!pl) continue
        byPos[pl.position]?.push({ name: pl.name, team: pl.teamName, price: pl.price, captain: row.is_captain })
        if (row.is_captain) captain = pl.name
      }
      return {
        name: p?.team_name || p?.display_name || 'Manager',
        crest: p?.crest || '⚽',
        color: p?.color || '#94a3b8',
        points: sq.fantasy_points ?? 0,
        spent: sq.budget_used ?? 0,
        captain,
        byPos,
      }
    })
    .sort((a, b) => b.points - a.points)

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-5 pb-24 sm:pb-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-cro-navy">Squads</h1>
          <p className="text-xs font-semibold text-cro-red">{stageLabel} · revealed</p>
        </div>
        <Link href="/" className="text-sm text-slate-400 hover:text-slate-700">
          ← Home
        </Link>
      </div>

      <div className="mt-4 space-y-3">
        {cards.map((c, i) => (
          <section key={i} className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
            <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5">
              <span
                className="flex h-7 w-7 items-center justify-center rounded-md text-sm text-white"
                style={{ backgroundColor: c.color }}
              >
                {c.crest}
              </span>
              <span className="flex-1 truncate font-bold text-cro-navy">{c.name}</span>
              <span className="text-xs text-slate-400">€{Number(c.spent).toFixed(1)}m</span>
              <span className="rounded-full bg-cro-navy px-2 py-0.5 text-xs font-bold text-white">{c.points} pts</span>
            </div>
            <div className="px-4 py-2 text-sm">
              {POSES.map((pos) => (
                <div key={pos} className="flex flex-wrap gap-x-2 gap-y-0.5 py-0.5">
                  <span className="w-9 shrink-0 text-[10px] font-bold text-slate-400">{pos}</span>
                  <span className="flex-1 text-cro-navy">
                    {c.byPos[pos].map((pl, j) => (
                      <span key={j} className="mr-2 inline-block">
                        {pl.name}
                        {pl.captain && <span className="ml-0.5 font-bold text-amber-600">(C)</span>}
                      </span>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ))}
        {cards.length === 0 && (
          <div className="rounded-2xl bg-white p-6 text-center text-sm text-slate-400 shadow-sm ring-1 ring-slate-200">
            No squads were submitted this round.
          </div>
        )}
      </div>
    </main>
  )
}
