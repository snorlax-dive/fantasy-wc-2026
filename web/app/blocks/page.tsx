import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAll } from '@/lib/supabase/fetchAll'
import { BlocksBoard, type Rival, type PoolPlayer, type Revealed } from './blocks-board'

export const dynamic = 'force-dynamic'

const STAGE_LABEL: Record<string, string> = {
  GROUP: 'Group stage',
  R32: 'Round of 32',
  R16: 'Round of 16',
  QF: 'Quarter-finals',
  SF: 'Semi-finals',
  FINAL: 'Final',
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export default async function BlocksPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // settings, fixtures, profiles, players all have RLS `using (true)` — server client is fine.
  // Only cross-user squads/squad_players need the admin client.
  const { data: settingsRows } = await supabase.from('settings').select('key, value')
  const settings = Object.fromEntries((settingsRows ?? []).map((r: any) => [r.key, r.value]))
  const stage = (settings['current_stage'] as string) ?? 'GROUP'
  const perTargetCap = Number(settings['block_per_target_cap'] ?? 2)
  const shieldsPerUser = Number(settings['shields_per_user'] ?? 2)
  const stageOpen = stage !== 'GROUP'

  const { data: firstFx } = await supabase
    .from('fixtures')
    .select('kickoff')
    .eq('stage', stage)
    .order('kickoff', { ascending: true })
    .limit(1)
    .maybeSingle()
  const locked =
    settings['tournament_locked'] === true || (firstFx ? new Date(firstFx.kickoff) <= new Date() : false)

  // Managers who have a squad this round = the blockable rivals. We DON'T expose
  // their squads (squads stay secret) — you block "blind" from the full pool.
  // Cross-user squads/squad_players are restricted by RLS → admin client required.
  const admin = createAdminClient()
  const { data: squads } = await admin.from('squads').select('id, user_id').eq('stage', stage)
  const squadIds = (squads ?? []).map((s: any) => s.id)
  const { data: sps } =
    squadIds.length > 0
      ? await admin.from('squad_players').select('squad_id, player_id').in('squad_id', squadIds)
      : { data: [] as any[] }
  const { data: profs } = await supabase.from('profiles').select('id, display_name, team_name')
  const poolRaw = await fetchAll((from, to) =>
    supabase.from('players').select('id, name, position, team:teams(name)').order('name').range(from, to)
  )

  const nameByUser = new Map<string, string>(
    (profs ?? []).map((p: any) => [p.id, p.team_name || p.display_name || 'Manager'])
  )
  const userBySquad = new Map<string, string>((squads ?? []).map((s: any) => [s.id, s.user_id]))
  const squadByUser = new Map<string, Set<number>>()
  for (const sp of sps ?? []) {
    const uid = userBySquad.get(sp.squad_id)
    if (!uid) continue
    if (!squadByUser.has(uid)) squadByUser.set(uid, new Set())
    squadByUser.get(uid)!.add(sp.player_id)
  }

  const rivals: Rival[] = [...squadByUser.keys()]
    .filter((uid) => uid !== user.id)
    .map((uid) => ({ userId: uid, name: nameByUser.get(uid) ?? 'Manager' }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const players: PoolPlayer[] = poolRaw.map((p: any) => {
    const team = Array.isArray(p.team) ? p.team[0] : p.team
    return { id: p.id as number, name: p.name as string, position: p.position as string, team: team?.name ?? '' }
  })
  const playerNameById = new Map<number, string>(players.map((p) => [p.id, p.name]))

  // Own blocks/shields and revealed blocks are all readable via RLS without admin.
  const { data: myBlock } = await supabase
    .from('blocks')
    .select('target, player_id')
    .eq('blocker', user.id)
    .eq('stage', stage)
    .maybeSingle()
  const { data: myShield } = await supabase
    .from('shield_uses')
    .select('id')
    .eq('user_id', user.id)
    .eq('stage', stage)
    .maybeSingle()
  const { count: shieldsUsed } = await supabase
    .from('shield_uses')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
  const shieldsLeft = Math.max(0, shieldsPerUser - (shieldsUsed ?? 0))

  // After lock: reveal who blocked whom, and whether it landed.
  let revealed: Revealed[] = []
  if (locked) {
    const { data: rb } = await supabase
      .from('blocks')
      .select('blocker, target, player_id')
      .eq('stage', stage)
      .eq('revealed', true)
    revealed = (rb ?? []).map((b: any) => ({
      blocker: nameByUser.get(b.blocker) ?? '?',
      target: nameByUser.get(b.target) ?? '?',
      player: playerNameById.get(b.player_id) ?? '?',
      hit: squadByUser.get(b.target)?.has(b.player_id) ?? false,
    }))
  }

  return (
    <BlocksBoard
      stageLabel={STAGE_LABEL[stage] ?? stage}
      stageOpen={stageOpen}
      locked={locked}
      perTargetCap={perTargetCap}
      shieldsLeft={shieldsLeft}
      rivals={rivals}
      players={players}
      myBlock={myBlock ? { targetUserId: myBlock.target, playerId: myBlock.player_id } : null}
      usedShield={!!myShield}
      revealed={revealed}
    />
  )
}
