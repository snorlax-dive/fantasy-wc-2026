import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ResultsEditor } from './results-editor'

export const dynamic = 'force-dynamic'

/* eslint-disable @typescript-eslint/no-explicit-any */
export default async function ResultsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: prof } = await supabase.from('profiles').select('is_commissioner').eq('id', user.id).maybeSingle()
  if (!prof?.is_commissioner) redirect('/')

  const admin = createAdminClient()
  const [{ data: fixtures }, { data: teams }] = await Promise.all([
    admin
      .from('fixtures')
      .select('id, stage, kickoff, team_a, team_b, score_a, score_b, finished, status, winner_team')
      .order('kickoff', { ascending: true }),
    admin.from('teams').select('id, name'),
  ])
  const teamName = Object.fromEntries((teams ?? []).map((t: any) => [t.id, t.name]))
  const list = (fixtures ?? []).map((f: any) => ({
    id: f.id,
    stage: f.stage,
    kickoff: f.kickoff,
    teamA: f.team_a,
    teamB: f.team_b,
    homeName: f.team_a != null ? teamName[f.team_a] ?? 'TBD' : 'TBD',
    awayName: f.team_b != null ? teamName[f.team_b] ?? 'TBD' : 'TBD',
    scoreA: f.score_a,
    scoreB: f.score_b,
    finished: f.finished,
    status: f.status,
    winnerTeam: f.winner_team ?? null,
  }))

  return <ResultsEditor fixtures={list} />
}
