import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAll } from '@/lib/supabase/fetchAll'
import { BlocksBoard, type Rival } from './blocks-board'

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

  const admin = createAdminClient()
  const { data: settingsRows } = await admin.from('settings').select('key, value')
  const settings = Object.fromEntries((settingsRows ?? []).map((r: any) => [r.key, r.value]))
  const stage = (settings['current_stage'] as string) ?? 'GROUP'
  const perTargetCap = Number(settings['block_per_target_cap'] ?? 2)
  const shieldsPerUser = Number(settings['shields_per_user'] ?? 2)
  const stageOpen = stage !== 'GROUP'

  const { data: firstFx } = await admin
    .from('fixtures')
    .select('kickoff')
    .eq('stage', stage)
    .order('kickoff', { ascending: true })
    .limit(1)
    .maybeSingle()
  const locked = firstFx ? new Date(firstFx.kickoff) <= new Date() : false

  // All squads for this round (admin read, so we can show rivals to target).
  const { data: squads } = await admin.from('squads').select('id, user_id').eq('stage', stage)
  const squadIds = (squads ?? []).map((s: any) => s.id)
  const { data: sps } =
    squadIds.length > 0
      ? await admin.from('squad_players').select('squad_id, player_id').in('squad_id', squadIds)
      : { data: [] as any[] }
  const { data: profs } = await admin.from('profiles').select('id, display_name')
  const players = await fetchAll((from, to) =>
    admin.from('players').select('id, name, position').range(from, to)
  )

  const nameByUser = new Map<string, string>((profs ?? []).map((p: any) => [p.id, p.display_name]))
  const playerById = new Map<number, any>((players ?? []).map((p: any) => [p.id, p]))
  const userBySquad = new Map<string, string>((squads ?? []).map((s: any) => [s.id, s.user_id]))

  const byUser = new Map<string, { id: number; name: string; position: string }[]>()
  for (const sp of sps ?? []) {
    const uid = userBySquad.get(sp.squad_id)
    const pl = playerById.get(sp.player_id)
    if (!uid || !pl) continue
    if (!byUser.has(uid)) byUser.set(uid, [])
    byUser.get(uid)!.push({ id: pl.id, name: pl.name, position: pl.position })
  }
  const rivals: Rival[] = [...byUser.entries()]
    .filter(([uid]) => uid !== user.id)
    .map(([uid, pls]) => ({ userId: uid, name: nameByUser.get(uid) ?? 'Manager', players: pls }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const { data: myBlock } = await admin
    .from('blocks')
    .select('target, player_id')
    .eq('blocker', user.id)
    .eq('stage', stage)
    .maybeSingle()
  const { data: myShield } = await admin
    .from('shield_uses')
    .select('id')
    .eq('user_id', user.id)
    .eq('stage', stage)
    .maybeSingle()
  const { count: shieldsUsed } = await admin
    .from('shield_uses')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
  const shieldsLeft = Math.max(0, shieldsPerUser - (shieldsUsed ?? 0))

  // After lock, reveal who blocked whom.
  let revealed: { blocker: string; target: string; player: string }[] = []
  if (locked) {
    const { data: rb } = await admin
      .from('blocks')
      .select('blocker, target, player_id')
      .eq('stage', stage)
      .eq('revealed', true)
    revealed = (rb ?? []).map((b: any) => ({
      blocker: nameByUser.get(b.blocker) ?? '?',
      target: nameByUser.get(b.target) ?? '?',
      player: playerById.get(b.player_id)?.name ?? '?',
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
      myBlock={myBlock ? { targetUserId: myBlock.target, playerId: myBlock.player_id } : null}
      usedShield={!!myShield}
      revealed={revealed}
    />
  )
}
