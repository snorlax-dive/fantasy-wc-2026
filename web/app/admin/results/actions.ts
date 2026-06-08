'use server'

import { createClient } from '@/lib/supabase/server'

/* eslint-disable @typescript-eslint/no-explicit-any */
async function requireCommissioner() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { supabase, ok: false as const }
  const { data } = await supabase.from('profiles').select('is_commissioner').eq('id', user.id).maybeSingle()
  return { supabase, ok: data?.is_commissioner === true }
}

export type ResultInput = {
  fixtureId: number
  scoreA: number | null
  scoreB: number | null
  finished: boolean
  winnerTeam: number | null // team id, or null
}

export async function saveFixtureResult(input: ResultInput): Promise<{ ok?: boolean; error?: string }> {
  const { supabase, ok } = await requireCommissioner()
  if (!ok) return { error: 'Commissioner only.' }

  const patch: Record<string, any> = {
    score_a: input.scoreA,
    score_b: input.scoreB,
    finished: input.finished,
    status: input.finished ? 'FINISHED' : 'SCHEDULED',
    winner_team: input.winnerTeam,
  }
  let { error } = await supabase.from('fixtures').update(patch).eq('id', input.fixtureId)
  if (error && /winner_team/.test(error.message)) {
    // Migration 0003 not applied — save the rest.
    delete patch.winner_team
    ;({ error } = await supabase.from('fixtures').update(patch).eq('id', input.fixtureId))
  }
  if (error) return { error: error.message }
  return { ok: true }
}

export async function playersForFixture(
  fixtureId: number
): Promise<{ players?: { id: number; name: string; position: string; team_id: number }[]; error?: string }> {
  const { supabase, ok } = await requireCommissioner()
  if (!ok) return { error: 'Commissioner only.' }
  const { data: fx } = await supabase.from('fixtures').select('team_a, team_b').eq('id', fixtureId).maybeSingle()
  if (!fx) return { error: 'Fixture not found.' }
  const teamIds = [fx.team_a, fx.team_b].filter((x: any) => x != null)
  if (teamIds.length === 0) return { players: [] }
  const { data, error } = await supabase
    .from('players')
    .select('id, name, position, team_id')
    .in('team_id', teamIds)
    .order('name', { ascending: true })
  if (error) return { error: error.message }
  return { players: (data ?? []) as any }
}

export type StatInput = {
  fixtureId: number
  playerId: number
  minutes: number
  goals: number
  redCard: boolean
  cleanSheet: boolean
}

export async function savePlayerStat(input: StatInput): Promise<{ ok?: boolean; error?: string }> {
  const { supabase, ok } = await requireCommissioner()
  if (!ok) return { error: 'Commissioner only.' }
  const { data: existing } = await supabase
    .from('player_match_stats')
    .select('*')
    .eq('fixture_id', input.fixtureId)
    .eq('player_id', input.playerId)
    .maybeSingle()
  const row = {
    fixture_id: input.fixtureId,
    player_id: input.playerId,
    minutes: input.minutes,
    goals: input.goals,
    own_goals: existing?.own_goals ?? 0,
    red_card: input.redCard,
    pens_saved: existing?.pens_saved ?? 0,
    pens_missed: existing?.pens_missed ?? 0,
    clean_sheet: input.cleanSheet,
    fantasy_points: existing?.fantasy_points ?? 0, // recompute (score?force=1) fixes points
  }
  const { error } = await supabase.from('player_match_stats').upsert(row, { onConflict: 'fixture_id,player_id' })
  if (error) return { error: error.message }
  return { ok: true }
}
