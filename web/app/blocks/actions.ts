'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

type Res = { ok?: boolean; error?: string }

/* eslint-disable @typescript-eslint/no-explicit-any */
async function stageContext(supabase: any) {
  const { data } = await supabase.from('settings').select('key, value')
  const settings = Object.fromEntries((data ?? []).map((r: any) => [r.key, r.value]))
  const stage = (settings['current_stage'] as string) ?? 'GROUP'
  const shieldsPerUser = Number(settings['shields_per_user'] ?? 2)
  const { data: fx } = await supabase
    .from('fixtures')
    .select('kickoff')
    .eq('stage', stage)
    .order('kickoff', { ascending: true })
    .limit(1)
    .maybeSingle()
  const locked =
    settings['tournament_locked'] === true || (fx ? new Date(fx.kickoff) <= new Date() : false)
  return { stage, shieldsPerUser, locked }
}

export async function saveBlock(input: {
  targetUserId: string | null
  playerId: number | null
}): Promise<Res> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'You are not signed in.' }

  const { stage, locked } = await stageContext(supabase)
  if (stage === 'GROUP') return { error: 'Blocks open in the knockout rounds.' }
  if (locked) return { error: 'This round is locked — blocks are revealed.' }

  if (input.targetUserId && input.playerId) {
    if (input.targetUserId === user.id) return { error: "You can't block yourself." }
    // Blind block: you don't see their squad — it lands only if they actually
    // picked this player (resolved at scoring). Just check the target is playing
    // this round and the player exists.
    // Target's squad and player lookup: target squad is cross-user (admin), player is public (supabase).
    const admin = createAdminClient()
    const { data: sq } = await admin
      .from('squads')
      .select('id')
      .eq('user_id', input.targetUserId)
      .eq('stage', stage)
      .maybeSingle()
    if (!sq) return { error: 'That manager has no squad this round yet.' }
    const { data: pl } = await supabase.from('players').select('id').eq('id', input.playerId).maybeSingle()
    if (!pl) return { error: 'Unknown player.' }

    const { error } = await supabase
      .from('blocks')
      .upsert(
        { blocker: user.id, stage, target: input.targetUserId, player_id: input.playerId, revealed: false },
        { onConflict: 'blocker,stage' }
      )
    if (error) return { error: error.message }
  } else {
    await supabase.from('blocks').delete().eq('blocker', user.id).eq('stage', stage)
  }
  return { ok: true }
}

export async function setShield(input: { use: boolean }): Promise<Res> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'You are not signed in.' }

  const { stage, shieldsPerUser, locked } = await stageContext(supabase)
  if (stage === 'GROUP') return { error: 'Shields are for the knockout rounds.' }
  if (locked) return { error: 'This round is locked.' }

  if (input.use) {
    const { data: existsThis } = await supabase
      .from('shield_uses')
      .select('id')
      .eq('user_id', user.id)
      .eq('stage', stage)
      .maybeSingle()
    if (!existsThis) {
      const { count } = await supabase
        .from('shield_uses')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
      if ((count ?? 0) >= shieldsPerUser) return { error: `No shields left (max ${shieldsPerUser}).` }
    }
    const { error } = await supabase
      .from('shield_uses')
      .upsert({ user_id: user.id, stage }, { onConflict: 'user_id,stage' })
    if (error) return { error: error.message }
  } else {
    await supabase.from('shield_uses').delete().eq('user_id', user.id).eq('stage', stage)
  }
  return { ok: true }
}
