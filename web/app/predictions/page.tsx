import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PredictionsBoard, type FixtureRow, type PlayerLite, type ExistingPrediction } from './predictions-board'

export const dynamic = 'force-dynamic'

export default async function PredictionsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: fx }, { data: teams }, { data: players }, { data: preds }] = await Promise.all([
    supabase
      .from('fixtures')
      .select('id, round, stage, kickoff, lock_time, team_a, team_b')
      .order('kickoff', { ascending: true }),
    supabase.from('teams').select('id, name'),
    supabase.from('players').select('id, name, team_id, position').eq('active', true).order('name'),
    supabase
      .from('predictions')
      .select('fixture_id, pred_a, pred_b, scorer1, scorer2, red_card_pred, is_banker')
      .eq('user_id', user.id),
  ])

  const teamName = new Map((teams ?? []).map((t) => [t.id as number, t.name as string]))

  const playersByTeam: Record<number, PlayerLite[]> = {}
  for (const p of players ?? []) {
    const t = p.team_id as number
    ;(playersByTeam[t] ??= []).push({ id: p.id as number, name: p.name as string, position: p.position as string })
  }

  const fixtures: FixtureRow[] = (fx ?? []).map((f) => ({
    id: f.id as number,
    round: (f.round as string) ?? 'Fixtures',
    kickoff: f.kickoff as string,
    lockTime: f.lock_time as string,
    home: { id: f.team_a as number, name: teamName.get(f.team_a as number) ?? 'TBD' },
    away: { id: f.team_b as number, name: teamName.get(f.team_b as number) ?? 'TBD' },
  }))

  const existing = (preds ?? []) as ExistingPrediction[]

  return <PredictionsBoard fixtures={fixtures} playersByTeam={playersByTeam} existing={existing} />
}
