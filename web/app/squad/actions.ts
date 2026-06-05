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

  // Lock check: no edits once the first match has kicked off.
  const { data: firstFx } = await supabase
    .from('fixtures')
    .select('kickoff')
    .order('kickoff', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (firstFx && new Date(firstFx.kickoff) <= new Date()) {
    return { error: 'Squads are locked — the tournament has started.' }
  }

  // Authoritative settings.
  const { data: settingsRows } = await supabase.from('settings').select('key, value')
  const settings = Object.fromEntries((settingsRows ?? []).map((r) => [r.key, r.value]))
  const budgetCap = Number(settings['budget_cap'] ?? 100)
  const formation = (settings['formation'] ?? { GK: 1, DEF: 4, MID: 3, FWD: 3 }) as Record<Pos, number>

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
  for (const pos of ['GK', 'DEF', 'MID', 'FWD'] as Pos[]) {
    if (counts[pos] !== formation[pos]) {
      return {
        error: `Formation must be ${formation.GK}-${formation.DEF}-${formation.MID}-${formation.FWD} (GK-DEF-MID-FWD). You have ${counts.GK}-${counts.DEF}-${counts.MID}-${counts.FWD}.`,
      }
    }
  }
  if (spend > budgetCap + 1e-9) {
    return { error: `Over budget: €${spend.toFixed(1)}m / €${budgetCap}m.` }
  }

  // Upsert the squad row, then replace its players.
  const { data: squad, error: sErr } = await supabase
    .from('squads')
    .upsert({ user_id: user.id, stage: 'GROUP', budget_used: spend }, { onConflict: 'user_id,stage' })
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
