import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SquadBuilder, type Player, type Formation } from './squad-builder'

export const dynamic = 'force-dynamic'

export default async function SquadPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: rawPlayers }, { data: settingsRows }, { data: firstFx }] = await Promise.all([
    supabase
      .from('players')
      .select('id, name, position, price, team:teams(name, flag_url)')
      .eq('active', true)
      .order('price', { ascending: false }),
    supabase.from('settings').select('key, value'),
    supabase.from('fixtures').select('kickoff').order('kickoff', { ascending: true }).limit(1).maybeSingle(),
  ])

  const settings = Object.fromEntries((settingsRows ?? []).map((r) => [r.key, r.value]))
  const budgetCap = Number(settings['budget_cap'] ?? 100)
  const formation = (settings['formation'] ?? { GK: 1, DEF: 4, MID: 3, FWD: 3 }) as Formation

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
    .eq('stage', 'GROUP')
    .maybeSingle()

  let initialPicks: { player_id: number; is_captain: boolean }[] = []
  if (squad) {
    const { data: sp } = await supabase
      .from('squad_players')
      .select('player_id, is_captain')
      .eq('squad_id', squad.id)
    initialPicks = (sp ?? []) as { player_id: number; is_captain: boolean }[]
  }

  const locked =
    settings['tournament_locked'] === true ||
    (firstFx ? new Date(firstFx.kickoff) <= new Date() : false)

  return (
    <SquadBuilder
      players={players}
      budgetCap={budgetCap}
      formation={formation}
      initialPicks={initialPicks}
      locked={locked}
    />
  )
}
