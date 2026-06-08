import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Countdown, LocalTime } from '@/components/countdown'

export const dynamic = 'force-dynamic'

const STAGE_LABEL: Record<string, string> = {
  GROUP: 'Group stage',
  R32: 'Round of 32',
  R16: 'Round of 16',
  QF: 'Quarter-finals',
  SF: 'Semi-finals',
  FINAL: 'Final',
}
const TILES = [
  { href: '/squad', title: 'Squad', emoji: '⚽' },
  { href: '/predictions', title: 'Predict', emoji: '🎯' },
  { href: '/bracket', title: 'Bracket', emoji: '🗺️' },
  { href: '/leaderboard', title: 'Table', emoji: '🏆' },
  { href: '/live', title: 'Live', emoji: '🔴' },
  { href: '/blocks', title: 'Blocks', emoji: '🛡️' },
  { href: '/squads', title: 'Squads', emoji: '👀' },
  { href: '/players', title: 'Players', emoji: '🔎' },
  { href: '/recap', title: 'My round', emoji: '📋' },
  { href: '/season', title: 'Season', emoji: '📈' },
  { href: '/achievements', title: 'Badges', emoji: '🏅' },
  { href: '/profile', title: 'Your club', emoji: '🎽' },
  { href: '/rules', title: 'Rules', emoji: '📖' },
]

/* eslint-disable @typescript-eslint/no-explicit-any */
function who(p: any) {
  return {
    name: p?.team_name || p?.display_name || 'Manager',
    crest: p?.crest || '⚽',
    color: p?.color || '#94a3b8',
  }
}

export default async function Home() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, team_name, crest, color, is_commissioner')
    .eq('id', user.id)
    .maybeSingle()
  const name = profile?.team_name || profile?.display_name || user.email

  const admin = createAdminClient()
  const [
    { data: lb },
    { data: profs },
    { data: squads },
    { data: blocks },
    { data: topStats },
    { data: settingsRows },
    { data: fixtures },
    { data: teams },
  ] = await Promise.all([
    supabase.rpc('get_leaderboard'),
    admin.from('profiles').select('id, display_name, team_name, crest, color'),
    admin.from('squads').select('user_id, stage, fantasy_points').gt('fantasy_points', 0),
    admin.from('blocks').select('blocker, target, player_id, stage').eq('revealed', true).limit(8),
    admin.from('player_match_stats').select('player_id, fantasy_points').order('fantasy_points', { ascending: false }).limit(6),
    admin.from('settings').select('key, value'),
    admin
      .from('fixtures')
      .select('id, stage, kickoff, team_a, team_b, status, score_a, score_b')
      .order('kickoff', { ascending: true }),
    admin.from('teams').select('id, name'),
  ])

  const pById = new Map((profs ?? []).map((p: any) => [p.id, p]))

  // Lock countdown (current round) + next matches
  const settings = Object.fromEntries((settingsRows ?? []).map((r: any) => [r.key, r.value]))
  const currentStage = (settings['current_stage'] as string) ?? 'GROUP'
  const teamName = new Map<number, string>((teams ?? []).map((t: any) => [t.id, t.name]))
  const lockISO = (fixtures ?? []).find((f: any) => f.stage === currentStage)?.kickoff ?? null
  const nowMs = Date.now()
  const upcoming = (fixtures ?? [])
    .filter((f: any) => f.status !== 'LIVE' && new Date(f.kickoff).getTime() > nowMs)
    .slice(0, 5)
    .map((f: any) => ({
      id: f.id,
      kickoff: f.kickoff,
      home: teamName.get(f.team_a) ?? 'TBD',
      away: teamName.get(f.team_b) ?? 'TBD',
    }))
  const live = (fixtures ?? [])
    .filter((f: any) => f.status === 'LIVE')
    .map((f: any) => ({
      id: f.id,
      home: teamName.get(f.team_a) ?? 'TBD',
      away: teamName.get(f.team_b) ?? 'TBD',
      a: f.score_a ?? 0,
      b: f.score_b ?? 0,
    }))
  const standings = (lb ?? []).slice(0, 3) as any[]

  // --- Onboarding: what this manager still needs to do for the current round ---
  const stageFxIds = (fixtures ?? []).filter((f: any) => f.stage === currentStage).map((f: any) => f.id)
  const squadSize = Number(settings['squad_size'] ?? 11)
  const locked = settings['tournament_locked'] === true
  const lockPassed = lockISO ? new Date(lockISO).getTime() <= nowMs : false
  const [{ data: mySquad }, { count: myPredCount }, { count: myBracketCount }] = await Promise.all([
    supabase.from('squads').select('id').eq('user_id', user.id).eq('stage', currentStage).maybeSingle(),
    supabase
      .from('predictions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .in('fixture_id', stageFxIds.length ? stageFxIds : [-1]),
    supabase.from('bracket_picks').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
  ])
  let mySquadCount = 0
  if (mySquad?.id) {
    const { count } = await supabase
      .from('squad_players')
      .select('*', { count: 'exact', head: true })
      .eq('squad_id', mySquad.id)
    mySquadCount = count ?? 0
  }
  const identityDone = Boolean(profile?.team_name)
  const squadDone = mySquadCount >= squadSize
  const predsDone = stageFxIds.length > 0 && (myPredCount ?? 0) >= stageFxIds.length
  const bracketDone = (myBracketCount ?? 0) > 0
  const onboarding = [
    { href: '/profile', label: 'Name your club', done: identityDone, hint: identityDone ? 'done' : 'pick a name, crest & colour' },
    { href: '/squad', label: 'Build your squad', done: squadDone, hint: squadDone ? `${mySquadCount}/${squadSize}` : `${mySquadCount}/${squadSize} picked` },
    {
      href: '/predictions',
      label: 'Make predictions',
      done: predsDone,
      hint: stageFxIds.length ? `${myPredCount ?? 0}/${stageFxIds.length} matches` : 'fixtures not set yet',
    },
    { href: '/bracket', label: 'Fill your bracket', done: bracketDone, hint: bracketDone ? 'done' : 'champion & golden boot' },
  ]
  const onboardingDone = onboarding.filter((o) => o.done).length
  // Show until everything's done, and only while the round is still open.
  const showOnboarding = !locked && !lockPassed && onboardingDone < onboarding.length

  // Manager of the Round = top fantasy_points per stage
  const motrByStage = new Map<string, { user_id: string; pts: number }>()
  for (const s of squads ?? []) {
    const cur = motrByStage.get(s.stage)
    if (!cur || s.fantasy_points > cur.pts) motrByStage.set(s.stage, { user_id: s.user_id, pts: s.fantasy_points })
  }
  const motr = [...motrByStage.entries()]

  // Resolve names for blocks + hauls
  const haulIds = (topStats ?? []).map((s: any) => s.player_id)
  const blockPlayerIds = (blocks ?? []).map((b: any) => b.player_id)
  const allPlayerIds = [...new Set([...haulIds, ...blockPlayerIds])]
  const playerNames = new Map<number, string>()
  if (allPlayerIds.length) {
    const { data: pl } = await admin.from('players').select('id, name').in('id', allPlayerIds)
    for (const p of pl ?? []) playerNames.set(p.id as number, p.name as string)
  }
  const hauls = (topStats ?? []).filter((s: any) => s.fantasy_points > 0).slice(0, 5)

  const hasBuzz = standings.some((s) => s.total_points > 0) || motr.length || (blocks ?? []).length || hauls.length

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-5 pb-24 sm:pb-10">
      {/* Hero */}
      <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        <div className="p-5">
          <p className="text-xs font-bold uppercase tracking-widest text-cro-red">Fantasy World Cup 2026</p>
          <h1 className="mt-1 text-2xl font-extrabold text-cro-navy">Welcome, {name} ⚽</h1>
          {profile?.is_commissioner && (
            <Link href="/admin" className="mt-3 inline-block rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800 ring-1 ring-amber-200">
              Commissioner panel →
            </Link>
          )}
        </div>
        <div className="checker h-1.5 w-full" />
      </section>

      {/* Lock countdown */}
      {lockISO && new Date(lockISO).getTime() > nowMs && (
        <div className="mt-4 flex items-center justify-between rounded-2xl bg-cro-navy px-4 py-3 text-white shadow-sm">
          <span className="text-sm font-semibold">⏰ Squads &amp; predictions lock in</span>
          <span className="text-base font-extrabold">
            <Countdown to={lockISO} />
          </span>
        </div>
      )}

      {/* Onboarding checklist */}
      {showOnboarding && (
        <section className="mt-4 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-cro-red/30">
          <h2 className="flex items-center justify-between border-b border-slate-100 bg-red-50 px-4 py-2 text-sm font-bold text-cro-navy">
            <span>🚀 Get ready for {STAGE_LABEL[currentStage] ?? currentStage}</span>
            <span className="text-xs font-bold text-cro-red">{onboardingDone}/{onboarding.length} done</span>
          </h2>
          <ul className="divide-y divide-slate-100">
            {onboarding.map((o) => (
              <li key={o.href}>
                <Link href={o.href} className="flex items-center gap-3 px-4 py-2.5 text-sm transition hover:bg-slate-50">
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${o.done ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
                    {o.done ? '✓' : ''}
                  </span>
                  <span className={`flex-1 font-semibold ${o.done ? 'text-slate-400 line-through' : 'text-cro-navy'}`}>{o.label}</span>
                  <span className="text-xs text-slate-400">{o.hint}</span>
                  {!o.done && <span className="text-cro-red">→</span>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Quick links */}
      <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {TILES.map((t) => (
          <Link key={t.href} href={t.href} className="flex flex-col items-center gap-1 rounded-xl bg-white p-3 text-center shadow-sm ring-1 ring-slate-200 transition hover:ring-cro-red">
            <span className="text-xl">{t.emoji}</span>
            <span className="text-[11px] font-bold text-cro-navy">{t.title}</span>
          </Link>
        ))}
      </div>

      {/* Live now */}
      {live.length > 0 && (
        <section className="mt-4 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-red-200">
          <Link href="/live" className="flex items-center justify-between border-b border-red-100 bg-red-50 px-4 py-2 text-sm font-bold text-cro-red">
            <span>🔴 Live now</span>
            <span className="text-xs font-semibold">My live points →</span>
          </Link>
          <ul className="divide-y divide-slate-100">
            {live.map((m) => (
              <li key={m.id}>
                <Link href={`/match/${m.id}`} className="flex items-center gap-2 px-4 py-2 text-sm transition hover:bg-slate-50">
                  <span className="flex-1 truncate text-right font-medium text-cro-navy">{m.home}</span>
                  <span className="rounded bg-cro-navy px-2 py-0.5 text-xs font-extrabold tabular-nums text-white">
                    {m.a}–{m.b}
                  </span>
                  <span className="flex-1 truncate font-medium text-cro-navy">{m.away}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Next matches */}
      {upcoming.length > 0 && (
        <section className="mt-4 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
          <h2 className="border-b border-slate-100 px-4 py-2 text-sm font-bold text-cro-navy">📅 Next matches</h2>
          <ul className="divide-y divide-slate-100">
            {upcoming.map((m) => (
              <li key={m.id}>
                <Link href={`/match/${m.id}`} className="flex items-center gap-2 px-4 py-2 text-sm transition hover:bg-slate-50">
                  <span className="flex-1 truncate text-right font-medium text-cro-navy">{m.home}</span>
                  <span className="text-xs text-slate-400">v</span>
                  <span className="flex-1 truncate font-medium text-cro-navy">{m.away}</span>
                  <span className="ml-2 shrink-0 text-xs text-slate-400">
                    <LocalTime iso={m.kickoff} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!hasBuzz ? (
        <div className="mt-4 rounded-2xl bg-white p-6 text-center text-sm text-slate-500 shadow-sm ring-1 ring-slate-200">
          The tournament hasn&apos;t kicked off yet. Lock your <Link href="/squad" className="font-semibold text-cro-red">squad</Link>,{' '}
          <Link href="/predictions" className="font-semibold text-cro-red">predictions</Link> and{' '}
          <Link href="/bracket" className="font-semibold text-cro-red">bracket</Link> — the buzz starts once the games begin.
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {/* Standings */}
          {standings.some((s) => s.total_points > 0) && (
            <Card title="🏆 Top of the table">
              {standings.map((s, i) => {
                const w = who(pById.get(s.user_id))
                return (
                  <Row key={s.user_id}>
                    <span className="w-5 text-center">{['🥇', '🥈', '🥉'][i]}</span>
                    <Crest w={w} />
                    <span className="flex-1 truncate font-semibold text-cro-navy">{w.name}</span>
                    <span className="font-extrabold tabular-nums text-cro-navy">{s.total_points}</span>
                  </Row>
                )
              })}
            </Card>
          )}

          {/* Manager of the round */}
          {motr.length > 0 && (
            <Card title="⭐ Manager of the round">
              {motr.map(([stage, m]) => {
                const w = who(pById.get(m.user_id))
                return (
                  <Row key={stage}>
                    <span className="w-20 shrink-0 text-xs font-semibold text-slate-400">{STAGE_LABEL[stage] ?? stage}</span>
                    <Crest w={w} />
                    <span className="flex-1 truncate font-semibold text-cro-navy">{w.name}</span>
                    <span className="font-extrabold tabular-nums text-cro-navy">{m.pts}</span>
                  </Row>
                )
              })}
            </Card>
          )}

          {/* Top hauls */}
          {hauls.length > 0 && (
            <Card title="🔥 Biggest hauls">
              {hauls.map((s: any, i: number) => (
                <Row key={i}>
                  <span className="flex-1 truncate text-cro-navy">{playerNames.get(s.player_id) ?? 'Player'}</span>
                  <span className="font-extrabold tabular-nums text-cro-blue">{s.fantasy_points} pts</span>
                </Row>
              ))}
            </Card>
          )}

          {/* Blocks */}
          {(blocks ?? []).length > 0 && (
            <Card title="🛡️ Blocks landed">
              {(blocks ?? []).map((b: any, i: number) => (
                <Row key={i}>
                  <span className="truncate text-sm text-slate-600">
                    <span className="font-semibold text-cro-navy">{who(pById.get(b.blocker)).name}</span> blocked{' '}
                    <span className="text-cro-red">{playerNames.get(b.player_id) ?? 'a player'}</span> on{' '}
                    <span className="font-semibold text-cro-navy">{who(pById.get(b.target)).name}</span>
                  </span>
                </Row>
              ))}
            </Card>
          )}
        </div>
      )}
    </main>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
      <h2 className="border-b border-slate-100 px-4 py-2 text-sm font-bold text-cro-navy">{title}</h2>
      <div className="divide-y divide-slate-100">{children}</div>
    </section>
  )
}
function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-2 px-4 py-2 text-sm">{children}</div>
}
function Crest({ w }: { w: { crest: string; color: string } }) {
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-xs text-white" style={{ backgroundColor: w.color }}>
      {w.crest}
    </span>
  )
}
