import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAll } from '@/lib/supabase/fetchAll'
import { PlayerExplorer } from './player-explorer'

export const dynamic = 'force-dynamic'

/* eslint-disable @typescript-eslint/no-explicit-any */
export default async function PlayersPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: settingsRows } = await admin.from('settings').select('key, value')
  const settings = Object.fromEntries((settingsRows ?? []).map((r: any) => [r.key, r.value]))
  const stage = (settings['current_stage'] as string) ?? 'GROUP'

  const players = await fetchAll((from, to) =>
    admin.from('players').select('id, name, position, price, expected_points, team_id, active').range(from, to)
  )
  const { data: teams } = await admin.from('teams').select('id, name')
  const teamName = new Map<number, string>((teams ?? []).map((t: any) => [t.id, t.name]))

  // Ownership for the current stage
  const { data: squads } = await admin.from('squads').select('id').eq('stage', stage)
  const squadIds = (squads ?? []).map((s: any) => s.id)
  const denom = squadIds.length
  const ownCount = new Map<number, number>()
  if (squadIds.length) {
    const sps = await fetchAll((from, to) =>
      admin.from('squad_players').select('player_id').in('squad_id', squadIds).range(from, to)
    )
    for (const sp of sps) ownCount.set(sp.player_id, (ownCount.get(sp.player_id) ?? 0) + 1)
  }

  // Season fantasy points
  const stats = await fetchAll((from, to) =>
    admin.from('player_match_stats').select('player_id, fantasy_points').range(from, to)
  )
  const ptsBy = new Map<number, number>()
  for (const s of stats) ptsBy.set(s.player_id, (ptsBy.get(s.player_id) ?? 0) + s.fantasy_points)

  const list = players
    .filter((p: any) => p.active !== false)
    .map((p: any) => ({
      id: p.id,
      name: p.name,
      pos: p.position,
      price: Number(p.price),
      xpts: Number(p.expected_points ?? 0),
      nation: teamName.get(p.team_id) ?? '—',
      owned: ownCount.get(p.id) ?? 0,
      pts: ptsBy.get(p.id) ?? 0,
    }))

  const nations = [...new Set(list.map((p) => p.nation))].sort()

  return <PlayerExplorer players={list} nations={nations} denom={denom} />
}
