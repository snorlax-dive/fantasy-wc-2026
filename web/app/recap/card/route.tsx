import { ImageResponse } from 'next/og'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* eslint-disable @typescript-eslint/no-explicit-any */
const STAGE_LABEL: Record<string, string> = {
  GROUP: 'Group stage',
  R32: 'Round of 32',
  R16: 'Round of 16',
  QF: 'Quarter-finals',
  SF: 'Semi-finals',
  FINAL: 'Final',
}

const SIZE = { width: 1200, height: 630 }

function Big({ value, label }: { value: string | number; label: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ display: 'flex', fontSize: 96, fontWeight: 800 }}>{value}</div>
      <div style={{ display: 'flex', fontSize: 28, color: '#cbd5e1' }}>{label}</div>
    </div>
  )
}

function card(children: React.ReactNode) {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: '#0e1c4e',
          color: '#fff',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', background: '#e4002b', padding: '28px 48px', fontSize: 34, fontWeight: 800 }}>
          Fantasy World Cup 2026
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '48px' }}>{children}</div>
      </div>
    ),
    SIZE
  )
}

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return card(<div style={{ display: 'flex', fontSize: 48 }}>Sign in to see your recap.</div>)
  }

  const { data: prof } = await supabase.from('profiles').select('team_name, display_name, crest').eq('id', user.id).maybeSingle()
  const club = prof?.team_name || prof?.display_name || 'Your Club'

  const { data: finishedFx } = await supabase
    .from('fixtures')
    .select('id, stage, kickoff')
    .eq('finished', true)
    .order('kickoff', { ascending: false })

  if (!finishedFx || finishedFx.length === 0) {
    return card(
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', fontSize: 64, fontWeight: 800 }}>{club}</div>
        <div style={{ display: 'flex', fontSize: 40, color: '#cbd5e1' }}>The tournament hasn&apos;t kicked off yet.</div>
      </div>
    )
  }

  const stage = finishedFx[0].stage as string
  const stageFxIds = finishedFx.filter((f: any) => f.stage === stage).map((f: any) => f.id)

  const { data: squad } = await supabase
    .from('squads')
    .select('id, fantasy_points')
    .eq('user_id', user.id)
    .eq('stage', stage)
    .maybeSingle()
  const squadTotal = squad?.fantasy_points ?? 0

  let topName = '—'
  let topPts = 0
  if (squad?.id) {
    const { data: sps } = await supabase.from('squad_players').select('player_id').eq('squad_id', squad.id)
    const pids = (sps ?? []).map((s: any) => s.player_id)
    const { data: stats } = await supabase
      .from('player_match_stats')
      .select('player_id, fantasy_points')
      .in('fixture_id', stageFxIds.length ? stageFxIds : [-1])
      .in('player_id', pids.length ? pids : [-1])
    const ptsBy = new Map<number, number>()
    for (const s of stats ?? []) ptsBy.set(s.player_id, (ptsBy.get(s.player_id) ?? 0) + s.fantasy_points)
    let bestId: number | null = null
    for (const [pid, v] of ptsBy) { if (v > topPts) { topPts = v; bestId = pid } }
    if (bestId != null) {
      const { data: p } = await supabase.from('players').select('name').eq('id', bestId).maybeSingle()
      topName = (p as any)?.name ?? '—'
    }
  }

  const { data: preds } = await supabase
    .from('predictions')
    .select('points')
    .eq('user_id', user.id)
    .in('fixture_id', stageFxIds.length ? stageFxIds : [-1])
  const predTotal = (preds ?? []).reduce((a: number, p: any) => a + (p.points ?? 0), 0)
  const roundTotal = squadTotal + predTotal

  const { data: lb } = await supabase.rpc('get_leaderboard')
  const rank = ((lb ?? []) as any[]).findIndex((r) => r.user_id === user.id) + 1
  const total = ((lb ?? []) as any[]).length

  return card(
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ display: 'flex', fontSize: 56 }}>{prof?.crest ?? '⚽'}</div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 56, fontWeight: 800 }}>{club}</div>
          <div style={{ display: 'flex', fontSize: 30, color: '#cbd5e1' }}>{STAGE_LABEL[stage] ?? stage} recap</div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', flex: 1 }}>
        <Big value={roundTotal} label="round points" />
        <Big value={rank > 0 ? `#${rank}` : '—'} label={total ? `of ${total}` : 'rank'} />
      </div>

      <div style={{ display: 'flex', fontSize: 34, color: '#fff' }}>
        🔥 Top performer: <span style={{ marginLeft: 12, fontWeight: 800 }}>{topName}</span>
        <span style={{ marginLeft: 12, color: '#cbd5e1' }}>({topPts} pts)</span>
      </div>
    </div>
  )
}
