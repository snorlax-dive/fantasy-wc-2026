import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyEmail } from '@/lib/email'
import { CommishPanel } from './commish-panel'

export const dynamic = 'force-dynamic'

export type Check = { label: string; ok: boolean; detail: string; warn?: boolean }

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

  // ---- Launch-readiness pre-flight ----
  const fxCount = (fx ?? []).length
  const [wt, lbq, loPrice, hiPrice, smtp] = await Promise.all([
    admin.from('fixtures').select('winner_team').limit(1),
    admin.rpc('get_leaderboard'),
    admin.from('players').select('price').order('price', { ascending: true }).limit(1).maybeSingle(),
    admin.from('players').select('price').order('price', { ascending: false }).limit(1).maybeSingle(),
    verifyEmail(),
  ])
  const minP = (loPrice.data as any)?.price ?? null
  const maxP = (hiPrice.data as any)?.price ?? null
  const needKeys = ['current_stage', 'tournament_locked', 'signups_open', 'budget_cap', 'formation']
  const missingKeys = needKeys.filter((k) => settings[k] === undefined)

  const checks: Check[] = [
    {
      label: 'Migration 0003 (winner_team)',
      ok: !wt.error,
      detail: wt.error ? 'Run web/supabase/migrations/0003_tighten.sql in Supabase' : 'column present',
    },
    { label: 'Leaderboard function', ok: !lbq.error, detail: lbq.error?.message ?? 'responding' },
    { label: 'Teams seeded', ok: (teams ?? 0) >= 48, warn: (teams ?? 0) > 0 && (teams ?? 0) < 48, detail: `${teams ?? 0} teams` },
    { label: 'Fixtures seeded', ok: fxCount > 0, detail: `${fxCount} fixtures` },
    {
      label: 'Players priced (with variance)',
      ok: (players ?? 0) > 0 && minP != null && maxP != null && maxP > minP,
      detail: (players ?? 0) > 0 ? `${players} players · €${minP}–€${maxP}` : 'no players',
    },
    { label: 'Settings present', ok: missingKeys.length === 0, detail: missingKeys.length ? `missing: ${missingKeys.join(', ')}` : 'all set' },
    { label: 'CRON_SECRET', ok: Boolean(process.env.CRON_SECRET), detail: process.env.CRON_SECRET ? 'set' : 'missing — cron + manual ops will 401' },
    { label: 'API-Football key', ok: Boolean(process.env.API_FOOTBALL_KEY), detail: process.env.API_FOOTBALL_KEY ? 'set' : 'missing — seeding/polling will fail' },
    { label: 'Site URL', ok: Boolean(process.env.NEXT_PUBLIC_SITE_URL), detail: process.env.NEXT_PUBLIC_SITE_URL ? 'set' : 'missing — login + email links break' },
    { label: 'Email (SMTP)', ok: smtp.ok, warn: !smtp.ok, detail: smtp.ok ? 'connected ✓' : smtp.error ?? 'not configured (optional)' },
  ]

  return (
    <CommishPanel
      currentStage={currentStage}
      tournamentLocked={settings['tournament_locked'] === true}
      signupsOpen={settings['signups_open'] !== false}
      counts={{ teams: teams ?? 0, players: players ?? 0, squads: squads ?? 0 }}
      fixturesByStage={byStage}
      readiness={checks}
    />
  )
}
