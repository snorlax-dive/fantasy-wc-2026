import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/* eslint-disable @typescript-eslint/no-explicit-any */
export default async function ManagersPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: prof } = await supabase.from('profiles').select('is_commissioner').eq('id', user.id).maybeSingle()
  if (!prof?.is_commissioner) redirect('/')

  const admin = createAdminClient()
  const { data: settingsRows } = await admin.from('settings').select('key, value')
  const settings = Object.fromEntries((settingsRows ?? []).map((r: any) => [r.key, r.value]))
  const stage = (settings['current_stage'] as string) ?? 'GROUP'
  const squadSize = Number(settings['squad_size'] ?? 11)

  const [{ data: profiles }, { data: fixtures }, { data: squads }, { data: preds }, { data: brackets }] =
    await Promise.all([
      admin.from('profiles').select('id, team_name, display_name, crest, color'),
      admin.from('fixtures').select('id, stage'),
      admin.from('squads').select('id, user_id').eq('stage', stage),
      admin.from('predictions').select('user_id, fixture_id'),
      admin.from('bracket_picks').select('user_id'),
    ])

  const stageFxIds = new Set((fixtures ?? []).filter((f: any) => f.stage === stage).map((f: any) => f.id))
  const squadIdByUser = new Map((squads ?? []).map((s: any) => [s.user_id, s.id]))
  const squadIds = (squads ?? []).map((s: any) => s.id)
  const { data: sps } = await admin
    .from('squad_players')
    .select('squad_id')
    .in('squad_id', squadIds.length ? squadIds : [-1])
  const spCount = new Map<string, number>()
  for (const sp of sps ?? []) spCount.set(sp.squad_id, (spCount.get(sp.squad_id) ?? 0) + 1)

  const predCount = new Map<string, number>()
  for (const p of preds ?? []) if (stageFxIds.has(p.fixture_id)) predCount.set(p.user_id, (predCount.get(p.user_id) ?? 0) + 1)
  const bracketSet = new Set((brackets ?? []).map((b: any) => b.user_id))

  // Emails (best-effort) to spot who hasn't joined / confirm address.
  const emailById = new Map<string, string>()
  try {
    const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
    for (const u of data?.users ?? []) if (u.email) emailById.set(u.id, u.email)
  } catch {
    /* ignore */
  }

  const nFx = stageFxIds.size
  const rows = (profiles ?? []).map((p: any) => {
    const sqId = squadIdByUser.get(p.id)
    const squad = sqId ? spCount.get(sqId) ?? 0 : 0
    const pc = predCount.get(p.id) ?? 0
    const done = [Boolean(p.team_name), squad >= squadSize, nFx > 0 && pc >= nFx, bracketSet.has(p.id)].filter(Boolean).length
    return {
      id: p.id,
      name: p.team_name || p.display_name || 'Manager',
      crest: p.crest || '⚽',
      color: p.color || '#94a3b8',
      email: emailById.get(p.id) ?? '—',
      identity: Boolean(p.team_name),
      squad,
      preds: pc,
      bracket: bracketSet.has(p.id),
      done,
    }
  })
  rows.sort((a, b) => a.done - b.done || a.name.localeCompare(b.name))
  const fullyReady = rows.filter((r) => r.done === 4).length

  const Tick = ({ ok }: { ok: boolean }) => (
    <span className={ok ? 'text-emerald-600' : 'text-slate-300'}>{ok ? '✓' : '·'}</span>
  )

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-5 pb-24 sm:pb-10">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-extrabold text-cro-navy">Managers</h1>
        <Link href="/admin" className="text-sm font-semibold text-cro-red">← Panel</Link>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        {rows.length} managers · {fullyReady} fully ready for {stage}. Columns: identity · squad · predictions · bracket.
      </p>

      <div className="mt-4 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-3 py-2 text-left">Manager</th>
              <th className="px-2 py-2 text-center">ID</th>
              <th className="px-2 py-2 text-center">XI</th>
              <th className="px-2 py-2 text-center">Pred</th>
              <th className="px-2 py-2 text-center">Brkt</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id} className={r.done === 4 ? '' : 'bg-amber-50/50'}>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-xs text-white" style={{ backgroundColor: r.color }}>
                      {r.crest}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-cro-navy">{r.name}</div>
                      <div className="truncate text-[11px] text-slate-400">{r.email}</div>
                    </div>
                  </div>
                </td>
                <td className="px-2 py-2 text-center"><Tick ok={r.identity} /></td>
                <td className="px-2 py-2 text-center text-xs tabular-nums">
                  <span className={r.squad >= squadSize ? 'font-bold text-emerald-600' : 'text-slate-400'}>{r.squad}/{squadSize}</span>
                </td>
                <td className="px-2 py-2 text-center text-xs tabular-nums">
                  <span className={nFx > 0 && r.preds >= nFx ? 'font-bold text-emerald-600' : 'text-slate-400'}>{r.preds}/{nFx}</span>
                </td>
                <td className="px-2 py-2 text-center"><Tick ok={r.bracket} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  )
}
