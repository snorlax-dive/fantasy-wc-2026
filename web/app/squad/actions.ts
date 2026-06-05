'use server'

import { createClient } from '@/lib/supabase/server'

type Pos = 'GK' | 'DEF' | 'MID' | 'FWD'
type SaveResult = { ok?: boolean; error?: string }

export async function saveSquad(input: {
  playerIds: number[]
  captainId: number | null
}): Promise<SaveResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'You are not signed in.' }

  // Authoritative settings + the current round (re-draft target).
  const { data: settingsRows } = await supabase.from('settings').select('key, value')
  const settings = Object.fromEntries((settingsRows ?? []).map((r) => [r.key, r.value]))
  const budgetCap = Number(settings['budget_cap'] ?? 100)
  const stage = (settings['current_stage'] as string) ?? 'GROUP'

  // Lock check: no edits once this round's first match has kicked off.
  const { data: firstFx } = await supabase
    .from('fixtures')
    .select('kickoff')
    .eq('stage', stage)
    .order('kickoff', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (firstFx && new Date(firstFx.kickoff) <= new Date()) {
    return { error: 'Squads are locked for this round.' }
  }

  const ids = [...new Set(input.playerIds)]
  if (ids.length !== 11) return { error: 'Pick exactly 11 players.' }
  if (!input.captainId || !ids.includes(input.captainId)) {
    return { error: 'Choose a captain from your XI.' }
  }

  // Re-validate against the DB (never trust client prices/positions).
  const { data: chosen, error } = await supabase
    .from('players')
    .select('id, position, price')
    .in('id', ids)
  if (error) return { error: error.message }
  if (!chosen || chosen.length !== 11) return { error: 'Some selected players were not found.' }

  const counts: Record<Pos, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 }
  let spend = 0
  for (const p of chosen) {
    counts[p.position as Pos]++
    spend += Number(p.price)
  }
  // Any legal formation (GK always 1; 3–5 DEF, 2–5 MID, 1–3 FWD; 11 total).
  if (counts.GK !== 1) return { error: 'Pick exactly 1 goalkeeper.' }
  if (counts.DEF < 3 || counts.DEF > 5) return { error: 'Pick 3–5 defenders.' }
  if (counts.MID < 2 || counts.MID > 5) return { error: 'Pick 2–5 midfielders.' }
  if (counts.FWD < 1 || counts.FWD > 3) return { error: 'Pick 1–3 forwards.' }
  if (spend > budgetCap + 1e-9) {
    return { error: `Over budget: €${spend.toFixed(1)}m / €${budgetCap}m.` }
  }

  // Upsert the squad row, then replace its players.
  const { data: squad, error: sErr } = await supabase
    .from('squads')
    .upsert({ user_id: user.id, stage, budget_used: spend }, { onConflict: 'user_id,stage' })
    .select('id')
    .single()
  if (sErr || !squad) return { error: sErr?.message ?? 'Could not save squad.' }

  await supabase.from('squad_players').delete().eq('squad_id', squad.id)
  const rows = ids.map((id) => ({
    squad_id: squad.id,
    player_id: id,
    is_captain: id === input.captainId,
  }))
  const { error: spErr } = await supabase.from('squad_players').insert(rows)
  if (spErr) return { error: spErr.message }

  return { ok: true }
}
