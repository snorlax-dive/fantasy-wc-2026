import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { LocalTime } from '@/components/countdown'

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

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const fixtureId = Number(id)
  if (!Number.isFinite(fixtureId)) notFound()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: fx } = await supabase
    .from('fixtures')
    .select('id, stage, kickoff, team_a, team_b, score_a, score_b, status, finished, had_red_card, winner_team')
    .eq('id', fixtureId)
    .maybeSingle()
  if (!fx) notFound()

  const { data: settingsRows } = await supabase.from('settings').select('key, value')
  const settings = Object.fromEntries((settingsRows ?? []).map((r: any) => [r.key, r.value]))
  const tournamentLocked = settings['tournament_locked'] === true

  const { data: teams } = await supabase.from('teams').select('id, name')
  const teamName = new Map<number, string>((teams ?? []).map((t: any) => [t.id, t.name]))
  const home = fx.team_a != null ? teamName.get(fx.team_a) ?? 'TBD' : 'TBD'
  const away = fx.team_b != null ? teamName.get(fx.team_b) ?? 'TBD' : 'TBD'
  const live = fx.status === 'LIVE'
  const kickoffPassed = new Date(fx.kickoff).getTime() <= new Date().getTime()
  const revealed = kickoffPassed || tournamentLocked || fx.finished || live

  // Per-player stats for this match
  const { data: pms } = await supabase
    .from('player_match_stats')
    .select('player_id, goals, red_card, minutes, fantasy_points')
    .eq('fixture_id', fixtureId)

  // My squad (for this fixture's stage) → which of my players featured here
  const { data: squad } = await supabase
    .from('squads')
    .select('id')
    .eq('user_id', user.id)
    .eq('stage', fx.stage)
    .maybeSingle()
  let myPids: number[] = []
  const captainOf = new Map<number, boolean>()
  if (squad?.id) {
    const { data: sps } = await supabase.from('squad_players').select('player_id, is_captain').eq('squad_id', squad.id)
    myPids = (sps ?? []).map((s: any) => s.player_id)
    for (const s of sps ?? []) captainOf.set(s.player_id, s.is_captain)
  }

  // Predictions: own prediction via regular client; others' revealed only after lock (cross-user → admin).
  const statPids = (pms ?? []).map((s: any) => s.player_id)
  const allPids = [...new Set([...statPids, ...myPids])]
  const [{ data: predsRaw }, { data: pl }, { data: profs }] = await Promise.all([
    revealed
      ? createAdminClient().from('predictions').select('user_id, pred_a, pred_b, points, is_banker').eq('fixture_id', fixtureId)
      : supabase.from('predictions').select('user_id, pred_a, pred_b, points, is_banker').eq('fixture_id', fixtureId),
    allPids.length
      ? supabase.from('players').select('id, name, position, team_id').in('id', allPids)
      : Promise.resolve({ data: [] as any[] }),
    supabase.from('profiles').select('id, team_name, display_name, crest, color'),
  ])
  const preds = predsRaw ?? []
  const playerById = new Map((pl ?? []).map((p: any) => [p.id, p]))
  const profById = new Map((profs ?? []).map((p: any) => [p.id, p]))

  const statBy = new Map<number, any>((pms ?? []).map((s: any) => [s.player_id, s]))
  const scorers = (pms ?? [])
    .filter((s: any) => s.goals > 0)
    .map((s: any) => ({ name: playerById.get(s.player_id)?.name ?? 'Player', team: playerById.get(s.player_id)?.team_id, goals: s.goals }))
  const reds = (pms ?? [])
    .filter((s: any) => s.red_card)
    .map((s: any) => ({ name: playerById.get(s.player_id)?.name ?? 'Player' }))

  const myInMatch = myPids
    .map((pid) => {
      const p = playerById.get(pid)
      if (!p || (p.team_id !== fx.team_a && p.team_id !== fx.team_b)) return null
      const st = statBy.get(pid)
      return {
        id: pid,
        name: p.name,
        position: p.position,
        captain: Boolean(captainOf.get(pid)),
        pts: st?.fantasy_points ?? 0,
        goals: st?.goals ?? 0,
        played: Boolean(st),
      }
    })
    .filter(Boolean) as any[]

  const nameOfManager = (uid: string) => {
    const p = profById.get(uid)
    return p?.team_name || p?.display_name || 'Manager'
  }
  const showScore = fx.finished || live || fx.score_a != null

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-5 pb-24 sm:pb-10">
      <div className="flex items-center justify-between">
        <Link href="/" className="text-sm font-semibold text-cro-red">← Home</Link>
        <span className="rounded-full bg-cro-navy px-3 py-1 text-xs font-bold text-white">{STAGE_LABEL[fx.stage] ?? fx.stage}</span>
      </div>

      {/* Scoreboard */}
      <section className="mt-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <div className="flex items-center justify-between gap-3">
          <span className="flex-1 text-right text-base font-extrabold text-cro-navy">{home}</span>
          <span className="shrink-0 text-center">
            {showScore ? (
              <span className="rounded-lg bg-cro-navy px-3 py-1 text-xl font-extrabold tabular-nums text-white">
                {fx.score_a ?? 0}–{fx.score_b ?? 0}
              </span>
            ) : (
              <span className="text-xs text-slate-400"><LocalTime iso={fx.kickoff} /></span>
            )}
          </span>
          <span className="flex-1 text-base font-extrabold text-cro-navy">{away}</span>
        </div>
        <div className="mt-2 text-center text-xs font-bold">
          {live ? (
            <span className="text-cro-red">🔴 LIVE</span>
          ) : fx.finished ? (
            <span className="text-slate-400">Full time{fx.winner_team ? ` · ${teamName.get(fx.winner_team)} won` : ''}</span>
          ) : (
            <span className="text-slate-400">Not started</span>
          )}
        </div>
      </section>

      {/* Goals & cards */}
      {(scorers.length > 0 || reds.length > 0) && (
        <section className="mt-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          {scorers.length > 0 && (
            <div className="text-sm text-cro-navy">
              <span className="font-bold">⚽ Scorers:</span>{' '}
              {scorers.map((s, i) => (
                <span key={i}>
                  {s.name}
                  {s.goals > 1 ? ` (${s.goals})` : ''}
                  {i < scorers.length - 1 ? ', ' : ''}
                </span>
              ))}
            </div>
          )}
          {reds.length > 0 && (
            <div className="mt-1 text-sm text-cro-navy">
              <span className="font-bold">🟥 Red cards:</span> {reds.map((r) => r.name).join(', ')}
            </div>
          )}
        </section>
      )}

      {/* Your players */}
      <section className="mt-4 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        <h2 className="border-b border-slate-100 px-4 py-2 text-sm font-bold text-cro-navy">Your players in this match</h2>
        {myInMatch.length === 0 ? (
          <p className="px-4 py-5 text-center text-sm text-slate-400">None of your XI featured here.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {myInMatch.map((p) => (
              <li key={p.id} className="flex items-center gap-2 px-4 py-2 text-sm">
                <span className="w-9 shrink-0 text-[11px] font-bold uppercase text-slate-400">{p.position}</span>
                <span className="flex-1 truncate font-semibold text-cro-navy">
                  {p.name}
                  {p.captain && <span className="ml-1 rounded bg-amber-400 px-1 text-[10px] font-extrabold text-white">C</span>}
                  {p.goals > 0 && <span className="ml-1">{'⚽'.repeat(Math.min(p.goals, 3))}</span>}
                </span>
                <span className="font-bold tabular-nums text-cro-navy">{p.played ? `${p.pts} pts` : '—'}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Predictions */}
      <section className="mt-4 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        <h2 className="border-b border-slate-100 px-4 py-2 text-sm font-bold text-cro-navy">
          🎯 Predictions {!revealed && <span className="text-xs font-normal text-slate-400">(hidden until kickoff)</span>}
        </h2>
        {preds.length === 0 ? (
          <p className="px-4 py-5 text-center text-sm text-slate-400">{revealed ? 'No predictions for this match.' : 'Yours is in — others reveal at kickoff.'}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {preds
              .slice()
              .sort((x: any, y: any) => (y.points ?? 0) - (x.points ?? 0))
              .map((p: any) => {
                const me = p.user_id === user.id
                const prof = profById.get(p.user_id)
                return (
                  <li key={p.user_id} className={`flex items-center gap-2 px-4 py-2 text-sm ${me ? 'bg-red-50' : ''}`}>
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-xs text-white" style={{ backgroundColor: prof?.color ?? '#94a3b8' }}>
                      {prof?.crest ?? '⚽'}
                    </span>
                    <span className="flex-1 truncate font-semibold text-cro-navy">
                      {me ? 'You' : nameOfManager(p.user_id)}
                      {p.is_banker && <span className="ml-1 rounded bg-cro-blue px-1 text-[10px] font-bold text-white">B</span>}
                    </span>
                    <span className="tabular-nums text-slate-500">{p.pred_a ?? '–'}–{p.pred_b ?? '–'}</span>
                    {revealed && fx.finished && <span className="w-10 text-right text-xs font-bold text-emerald-600">{p.points ?? 0} pts</span>}
                  </li>
                )
              })}
          </ul>
        )}
      </section>
    </main>
  )
}
