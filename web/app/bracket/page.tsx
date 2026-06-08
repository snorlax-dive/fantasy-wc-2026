import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetchAll'
import { BracketBoard, type TeamRow, type PlayerOption } from './bracket-board'

export const dynamic = 'force-dynamic'

const LEVEL_FROM_PICK: Record<string, number> = {
  REACH_R16: 1,
  REACH_QF: 2,
  REACH_SF: 3,
  REACH_FINAL: 4,
  CHAMPION: 5,
}

export default async function BracketPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: teams }, { data: picks }, { data: firstFx }, { data: settingsRows }] = await Promise.all([
    supabase.from('teams').select('id, name, flag_url').order('name'),
    supabase
      .from('bracket_picks')
      .select('pick_type, team_id, player_id')
      .eq('user_id', user.id),
    supabase.from('fixtures').select('kickoff').order('kickoff', { ascending: true }).limit(1).maybeSingle(),
    supabase.from('settings').select('key, value'),
  ])
  const settings = Object.fromEntries((settingsRows ?? []).map((r) => [r.key, r.value]))
  const players = await fetchAll((from, to) =>
    supabase.from('players').select('id, name, team:teams(name)').order('name').range(from, to)
  )

  const teamRows: TeamRow[] = (teams ?? []).map((t) => ({
    id: t.id as number,
    name: t.name as string,
    flag: (t.flag_url as string) ?? null,
  }))

  const playerOptions: PlayerOption[] = (players ?? []).map((p) => {
    const team = Array.isArray(p.team) ? p.team[0] : p.team
    return { id: p.id as number, name: p.name as string, team: team?.name ?? '' }
  })

  const furthest: Record<number, number> = {}
  let goldenBoot: number | null = null
  for (const row of picks ?? []) {
    if (row.pick_type === 'GOLDEN_BOOT') {
      goldenBoot = row.player_id as number
      continue
    }
    const lvl = LEVEL_FROM_PICK[row.pick_type as string]
    const tid = row.team_id as number
    if (lvl && tid) furthest[tid] = Math.max(furthest[tid] ?? 0, lvl)
  }

  const locked =
    settings['tournament_locked'] === true || (firstFx ? new Date(firstFx.kickoff) <= new Date() : false)

  return (
    <BracketBoard
      teams={teamRows}
      players={playerOptions}
      initialFurthest={furthest}
      initialGoldenBoot={goldenBoot}
      locked={locked}
      lockAt={firstFx?.kickoff ?? null}
    />
  )
}
