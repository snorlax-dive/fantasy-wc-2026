import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAll } from '@/lib/supabase/fetchAll'
import {
  PredictionsBoard,
  type FixtureRow,
  type PlayerLite,
  type ExistingPrediction,
  type RevealPick,
} from './predictions-board'

export const dynamic = 'force-dynamic'

export default async function PredictionsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: fx }, { data: teams }, { data: preds }, { data: tlRow }] = await Promise.all([
    supabase
      .from('fixtures')
      .select('id, round, stage, kickoff, lock_time, team_a, team_b')
      .order('kickoff', { ascending: true }),
    supabase.from('teams').select('id, name'),
    supabase
      .from('predictions')
      .select('fixture_id, pred_a, pred_b, scorer1, scorer2, red_card_pred, is_banker')
      .eq('user_id', user.id),
    supabase.from('settings').select('value').eq('key', 'tournament_locked').maybeSingle(),
  ])
  const globalLock = tlRow?.value === true
  const players = await fetchAll((from, to) =>
    supabase.from('players').select('id, name, team_id, position').eq('active', true).order('name').range(from, to)
  )

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

  // Reveal: once a match locks, show everyone's picks (cross-user → admin read).
  const now = Date.now()
  const lockedIds = fixtures.filter((f) => new Date(f.lockTime).getTime() <= now).map((f) => f.id)
  const reveal: Record<number, RevealPick[]> = {}
  if (lockedIds.length > 0) {
    const admin = createAdminClient()
    const allPreds = await fetchAll((from, to) =>
      admin.from('predictions').select('fixture_id, user_id, pred_a, pred_b, is_banker').in('fixture_id', lockedIds).range(from, to)
    )
    const { data: profs } = await admin.from('profiles').select('id, display_name, team_name, crest, color')
    const profById = new Map((profs ?? []).map((p) => [p.id as string, p]))
    for (const pr of allPreds) {
      const pf = profById.get(pr.user_id as string)
      ;(reveal[pr.fixture_id as number] ??= []).push({
        name: (pf?.team_name as string) || (pf?.display_name as string) || 'Manager',
        crest: (pf?.crest as string) || '⚽',
        color: (pf?.color as string) || '#94a3b8',
        a: pr.pred_a,
        b: pr.pred_b,
        banker: pr.is_banker,
      })
    }
  }

  return (
    <PredictionsBoard
      fixtures={fixtures}
      playersByTeam={playersByTeam}
      existing={existing}
      reveal={reveal}
      globalLock={globalLock}
    />
  )
}
