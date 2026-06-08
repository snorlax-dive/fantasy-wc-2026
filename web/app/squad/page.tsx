import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAll } from '@/lib/supabase/fetchAll'
import { SquadBuilder, type Player } from './squad-builder'

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
  const stage = (settings['current_stage'] as string) ?? 'GROUP'

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

  // League ownership for this stage (cross-user → admin read).
  const admin = createAdminClient()
  const { data: stageSquads } = await admin.from('squads').select('id').eq('stage', stage)
  const stageSquadIds = (stageSquads ?? []).map((s) => s.id)
  const managerCount = stageSquadIds.length
  const ownedBy: Record<number, number> = {}
  if (stageSquadIds.length > 0) {
    const ownRows = await fetchAll((from, to) =>
      admin.from('squad_players').select('player_id').in('squad_id', stageSquadIds).range(from, to)
    )
    for (const r of ownRows) ownedBy[r.player_id as number] = (ownedBy[r.player_id as number] ?? 0) + 1
  }

  // Triple Captain chip status.
  const { data: tcChip } = await supabase
    .from('chip_uses')
    .select('stage')
    .eq('user_id', user.id)
    .eq('chip', 'TRIPLE_CAPTAIN')
    .maybeSingle()
  const tripleCaptainStage = (tcChip?.stage as string) ?? null

  let playersQuery = supabase
    .from('players')
    .select('id, name, position, price, team:teams(name, flag_url)')
    .eq('active', true)
  if (aliveTeamIds.size > 0) playersQuery = playersQuery.in('team_id', [...aliveTeamIds])
  const rawPlayers = await fetchAll((from, to) => playersQuery.order('price', { ascending: false }).range(from, to))

  const statRows = await fetchAll((from, to) =>
    supabase.from('player_match_stats').select('player_id, fantasy_points').range(from, to)
  )
  const ptsById = new Map<number, number>()
  for (const s of statRows) {
    ptsById.set(s.player_id as number, (ptsById.get(s.player_id as number) ?? 0) + (s.fantasy_points ?? 0))
  }

  const players: Player[] = rawPlayers.map((p) => {
    const team = Array.isArray(p.team) ? p.team[0] : p.team
    return {
      id: p.id as number,
      name: p.name as string,
      position: p.position as Player['position'],
      price: Number(p.price),
      team: team?.name ?? '',
      flag: team?.flag_url ?? null,
      points: ptsById.get(p.id as number) ?? 0,
      owned: ownedBy[p.id as number] ?? 0,
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
      initialPicks={initialPicks}
      locked={locked}
      stageLabel={STAGE_LABEL[stage] ?? stage}
      currentStage={stage}
      managerCount={managerCount}
      tripleCaptainStage={tripleCaptainStage}
      lockAt={firstKickoff ?? null}
    />
  )
}
