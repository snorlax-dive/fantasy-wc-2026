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
  return { ok: true }
}
