'use server'

import { createClient } from '@/lib/supabase/server'

const STAGES = ['GROUP', 'R32', 'R16', 'QF', 'SF', 'FINAL']

async function requireCommissioner() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { supabase, ok: false as const }
  const { data } = await supabase
    .from('profiles')
    .select('is_commissioner')
    .eq('id', user.id)
    .maybeSingle()
  return { supabase, ok: data?.is_commissioner === true }
}

export async function setSignupsOpen(open: boolean): Promise<{ ok?: boolean; error?: string }> {
  const { supabase, ok } = await requireCommissioner()
  if (!ok) return { error: 'Commissioner only.' }
  const { error } = await supabase
    .from('settings')
    .update({ value: open, updated_at: new Date().toISOString() })
    .eq('key', 'signups_open')
  if (error) return { error: error.message }
  return { ok: true }
}

export async function setTournamentLock(locked: boolean): Promise<{ ok?: boolean; error?: string }> {
  const { supabase, ok } = await requireCommissioner()
  if (!ok) return { error: 'Commissioner only.' }
  const { error } = await supabase
    .from('settings')
    .update({ value: locked, updated_at: new Date().toISOString() })
    .eq('key', 'tournament_locked')
  if (error) return { error: error.message }
  return { ok: true }
}

export async function setStage(stage: string): Promise<{ ok?: boolean; error?: string }> {
  if (!STAGES.includes(stage)) return { error: 'Invalid stage.' }
  const { supabase, ok } = await requireCommissioner()
  if (!ok) return { error: 'Commissioner only.' }
  // settings.value is jsonb; RLS allows commissioner writes.
  const { error } = await supabase
    .from('settings')
    .update({ value: stage, updated_at: new Date().toISOString() })
    .eq('key', 'current_stage')
  if (error) return { error: error.message }

  // Snapshot current standings as the baseline for the new round, so the
  // leaderboard can show ▲▼ movement during the upcoming stage. Best-effort.
  try {
    const { data: lb } = await supabase.rpc('get_leaderboard')
    const baseline: Record<string, number> = {}
    ;(lb ?? []).forEach((r: { user_id: string }, i: number) => {
      baseline[r.user_id] = i + 1
    })
    await supabase
      .from('settings')
      .upsert({ key: 'standings_baseline', value: baseline, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    await supabase
      .from('settings')
      .upsert({ key: 'standings_baseline_stage', value: stage, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  } catch {
    /* non-fatal */
  }
  return { ok: true }
}
