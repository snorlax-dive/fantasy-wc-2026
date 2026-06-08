'use server'

import { createClient } from '@/lib/supabase/server'

type SaveResult = { ok?: boolean; error?: string }

// level: 0 out / 1 R16 / 2 QF / 3 SF / 4 Final / 5 Champion
const REACH_BY_LEVEL: Record<number, string[]> = {
  1: ['REACH_R16'],
  2: ['REACH_R16', 'REACH_QF'],
  3: ['REACH_R16', 'REACH_QF', 'REACH_SF'],
  4: ['REACH_R16', 'REACH_QF', 'REACH_SF', 'REACH_FINAL'],
  5: ['REACH_R16', 'REACH_QF', 'REACH_SF', 'REACH_FINAL', 'CHAMPION'],
}

export async function saveBracket(input: {
  furthest: Record<string, number>
  goldenBoot: number | null
}): Promise<SaveResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'You are not signed in.' }

  const { data: tl } = await supabase.from('settings').select('value').eq('key', 'tournament_locked').maybeSingle()
  if (tl?.value === true) return { error: 'The game is locked by the commissioner.' }

  const { data: firstFx } = await supabase
    .from('fixtures')
    .select('kickoff')
    .order('kickoff', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (firstFx && new Date(firstFx.kickoff) <= new Date()) {
    return { error: 'The bracket is locked — the tournament has started.' }
  }

  const levels = Object.entries(input.furthest)
    .map(([tid, l]) => ({ tid: Number(tid), l: Number(l) }))
    .filter((x) => x.l > 0)

  const atLeast = (n: number) => levels.filter((x) => x.l >= n).length
  if (atLeast(1) > 16) return { error: 'At most 16 teams can reach the Round of 16.' }
  if (atLeast(2) > 8) return { error: 'At most 8 teams can reach the Quarter-finals.' }
  if (atLeast(3) > 4) return { error: 'At most 4 teams can reach the Semi-finals.' }
  if (atLeast(4) > 2) return { error: 'At most 2 teams can reach the Final.' }
  if (atLeast(5) > 1) return { error: 'You can only pick one Champion.' }

  const rows: {
    user_id: string
    pick_type: string
    team_id?: number
    player_id?: number
    points: number
  }[] = []
  for (const { tid, l } of levels) {
    for (const pt of REACH_BY_LEVEL[l] ?? []) {
      rows.push({ user_id: user.id, pick_type: pt, team_id: tid, points: 0 })
    }
  }
  if (input.goldenBoot) {
    rows.push({ user_id: user.id, pick_type: 'GOLDEN_BOOT', player_id: input.goldenBoot, points: 0 })
  }

  await supabase.from('bracket_picks').delete().eq('user_id', user.id)
  if (rows.length) {
    const { error } = await supabase.from('bracket_picks').insert(rows)
    if (error) return { error: error.message }
  }
  return { ok: true }
}
