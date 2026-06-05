import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { CommishPanel } from './commish-panel'

export const dynamic = 'force-dynamic'

/* eslint-disable @typescript-eslint/no-explicit-any */
export default async function AdminPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_commissioner')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile?.is_commissioner) redirect('/')

  const admin = createAdminClient()
  const { data: settingsRows } = await admin.from('settings').select('key, value')
  const settings = Object.fromEntries((settingsRows ?? []).map((r: any) => [r.key, r.value]))
  const currentStage = (settings['current_stage'] as string) ?? 'GROUP'

  const [{ count: teams }, { count: players }, { count: squads }, { data: fx }] = await Promise.all([
    admin.from('teams').select('*', { count: 'exact', head: true }),
    admin.from('players').select('*', { count: 'exact', head: true }),
    admin.from('squads').select('*', { count: 'exact', head: true }),
    admin.from('fixtures').select('stage, finished'),
  ])

  const byStage: Record<string, { total: number; finished: number }> = {}
  for (const f of fx ?? []) {
    const s = f.stage as string
    byStage[s] ??= { total: 0, finished: 0 }
    byStage[s].total++
    if (f.finished) byStage[s].finished++
  }

  return (
    <CommishPanel
      currentStage={currentStage}
      counts={{ teams: teams ?? 0, players: players ?? 0, squads: squads ?? 0 }}
      fixturesByStage={byStage}
    />
  )
}
