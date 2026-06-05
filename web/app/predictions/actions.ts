'use server'

import { createClient } from '@/lib/supabase/server'

type SaveResult = { ok?: boolean; error?: string }

export async function savePrediction(input: {
  fixtureId: number
  predA: number | null
  predB: number | null
  scorer1: number | null
  scorer2: number | null
  redCard: boolean
  banker: boolean
}): Promise<SaveResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'You are not signed in.' }

  const { data: fixture, error: fErr } = await supabase
    .from('fixtures')
    .select('id, stage, lock_time, team_a, team_b')
    .eq('id', input.fixtureId)
    .maybeSingle()
  if (fErr || !fixture) return { error: 'Match not found.' }
  if (new Date(fixture.lock_time) <= new Date()) return { error: 'This match is locked (kicked off).' }

  const { predA, predB } = input
  if (
    predA == null ||
    predB == null ||
    !Number.isInteger(predA) ||
    !Number.isInteger(predB) ||
    predA < 0 ||
    predB < 0 ||
    predA > 99 ||
    predB > 99
  ) {
    return { error: 'Enter a valid score for both teams.' }
  }

  // Validate any chosen scorers actually play for one of the two teams.
  const scorerIds = [input.scorer1, input.scorer2].filter((x): x is number => !!x)
  if (scorerIds.length) {
    const { data: sp } = await supabase.from('players').select('id, team_id').in('id', scorerIds)
    const okTeams = new Set([fixture.team_a, fixture.team_b])
    for (const id of scorerIds) {
      const row = (sp ?? []).find((r) => r.id === id)
      if (!row || !okTeams.has(row.team_id)) {
        return { error: 'A chosen scorer is not in this match.' }
      }
    }
  }

  const { error: upErr } = await supabase.from('predictions').upsert(
    {
      user_id: user.id,
      fixture_id: input.fixtureId,
      pred_a: predA,
      pred_b: predB,
      scorer1: input.scorer1,
      scorer2: input.scorer2,
      red_card_pred: input.redCard,
      is_banker: input.banker,
    },
    { onConflict: 'user_id,fixture_id' }
  )
  if (upErr) return { error: upErr.message }

  // Only one Banker per stage: clear it on the user's other predictions in this stage.
  if (input.banker) {
    const { data: stageFx } = await supabase.from('fixtures').select('id').eq('stage', fixture.stage)
    const others = (stageFx ?? []).map((f) => f.id).filter((id) => id !== input.fixtureId)
    if (others.length) {
      await supabase
        .from('predictions')
        .update({ is_banker: false })
        .eq('user_id', user.id)
        .in('fixture_id', others)
    }
  }

  return { ok: true }
}
