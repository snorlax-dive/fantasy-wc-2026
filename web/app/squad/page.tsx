import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SquadBuilder, type Player, type Formation } from './squad-builder'

export const dynamic = 'force-dynamic'

const STAGE_LABEL: Record<string, string> = {
  GROUP: 'Group stage',
  R32: 'Round of 32',
  R16: 'Round of 16',
  QF: 'Quarter-finals',
  SF: 'Semi-finals',
  FINAL: 'Final',
}

export default async function SquadPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: settingsRows } = await supabase.from('settings').select('key, value')
  const settings = Object.fromEntries((settingsRows ?? []).map((r) => [r.key, r.value]))
  const budgetCap = Number(settings['budget_cap'] ?? 100)
  const formation = (settings['formation'] ?? { GK: 1, DEF: 4, MID: 3, FWD: 3 }) as Formation
  const stage = (settings['current_stage'] as string) ?? 'GROUP'

  // Fixtures for this round → lock time + which teams are still involved.
  const { data: stageFx } = await supabase
    .from('fixtures')
    .select('kickoff, team_a, team_b')
    .eq('stage', stage)
    .order('kickoff', { ascending: true })

  const aliveTeamIds = new Set<number>()
  for (const f of stageFx ?? []) {
    if (f.team_a != null) aliveTeamIds.add(f.team_a as number)
    if (f.team_b != null) aliveTeamIds.add(f.team_b as number)
  }
  const firstKickoff = (stageFx ?? [])[0]?.kickoff
  const locked =
    settings['tournament_locked'] === true || (firstKickoff ? new Date(firstKickoff) <= new Date() : false)

  // Player pool: restrict to teams still in this round when we know them; else all.
  let playersQuery = supabase
    .from('players')
    .select('id, name, position, price, team:teams(name, flag_url)')
    .eq('active', true)
  if (aliveTeamIds.size > 0) playersQuery = playersQuery.in('team_id', [...aliveTeamIds])
  const { data: rawPlayers } = await playersQuery.order('price', { ascending: false })

  const players: Player[] = (rawPlayers ?? []).map((p) => {
    const team = Array.isArray(p.team) ? p.team[0] : p.team
    return {
      id: p.id as number,
      name: p.name as string,
      position: p.position as Player['position'],
      price: Number(p.price),
      team: team?.name ?? '',
      flag: team?.flag_url ?? null,
    }
  })

  const { data: squad } = await supabase
    .from('squads')
    .select('id')
    .eq('user_id', user.id)
    .eq('stage', stage)
    .maybeSingle()

  let initialPicks: { player_id: number; is_captain: boolean }[] = []
  if (squad) {
    const { data: sp } = await supabase
      .from('squad_players')
      .select('player_id, is_captain')
      .eq('squad_id', squad.id)
    initialPicks = (sp ?? []) as { player_id: number; is_captain: boolean }[]
  }

  return (
    <SquadBuilder
      players={players}
      budgetCap={budgetCap}
      formation={formation}
      initialPicks={initialPicks}
      locked={locked}
      stageLabel={STAGE_LABEL[stage] ?? stage}
    />
  )
}
