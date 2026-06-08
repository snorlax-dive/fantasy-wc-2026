'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { toast } from '@/components/toast'
import { saveFixtureResult, savePlayerStat, playersForFixture } from './actions'

type Fx = {
  id: number
  stage: string
  kickoff: string
  teamA: number | null
  teamB: number | null
  homeName: string
  awayName: string
  scoreA: number | null
  scoreB: number | null
  finished: boolean
  status: string
  winnerTeam: number | null
}
type Player = { id: number; name: string; position: string; team_id: number }

export function ResultsEditor({ fixtures }: { fixtures: Fx[] }) {
  const [selId, setSelId] = useState<number | null>(null)
  const [pending, start] = useTransition()
  const sel = fixtures.find((f) => f.id === selId) ?? null

  // fixture-result form state
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [fin, setFin] = useState(false)
  const [winner, setWinner] = useState<'none' | 'home' | 'away'>('none')

  // player-stat form state
  const [players, setPlayers] = useState<Player[]>([])
  const [pid, setPid] = useState<number | null>(null)
  const [mins, setMins] = useState('90')
  const [goals, setGoals] = useState('0')
  const [red, setRed] = useState(false)
  const [cs, setCs] = useState(false)

  function pick(f: Fx) {
    setSelId(f.id)
    setA(f.scoreA == null ? '' : String(f.scoreA))
    setB(f.scoreB == null ? '' : String(f.scoreB))
    setFin(f.finished)
    setWinner(f.winnerTeam == null ? 'none' : f.winnerTeam === f.teamA ? 'home' : 'away')
    setPlayers([])
    setPid(null)
    start(async () => {
      const res = await playersForFixture(f.id)
      if (res.players) setPlayers(res.players)
      else if (res.error) toast(res.error, 'err')
    })
  }

  function saveResult() {
    if (!sel) return
    const winnerTeam = winner === 'home' ? sel.teamA : winner === 'away' ? sel.teamB : null
    start(async () => {
      const res = await saveFixtureResult({
        fixtureId: sel.id,
        scoreA: a === '' ? null : Number(a),
        scoreB: b === '' ? null : Number(b),
        finished: fin,
        winnerTeam,
      })
      if (res.ok) toast('Result saved — recompute to apply ✅')
      else toast(res.error ?? 'Save failed', 'err')
    })
  }

  function saveStat() {
    if (!sel || pid == null) {
      toast('Pick a player first', 'err')
      return
    }
    start(async () => {
      const res = await savePlayerStat({
        fixtureId: sel.id,
        playerId: pid,
        minutes: Number(mins) || 0,
        goals: Number(goals) || 0,
        redCard: red,
        cleanSheet: cs,
      })
      if (res.ok) toast('Player stat saved — recompute to apply ✅')
      else toast(res.error ?? 'Save failed', 'err')
    })
  }

  function recompute() {
    start(async () => {
      toast('Recomputing…')
      try {
        const res = await fetch('/api/admin/score?force=1', { method: 'GET' })
        const j = await res.json()
        toast(res.ok ? 'Scores recomputed ✅' : `Failed: ${JSON.stringify(j)}`, res.ok ? 'ok' : 'err')
      } catch (e) {
        toast(String(e), 'err')
      }
    })
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-5 pb-24 sm:pb-10">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-extrabold text-cro-navy">Fix results</h1>
        <Link href="/admin" className="text-sm font-semibold text-cro-red">← Panel</Link>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Manual override for when the data feed is wrong. Edit a score or a single player&apos;s stat line, then
        recompute.
      </p>

      <div className="mt-4 rounded-2xl bg-amber-50 p-3 text-xs text-amber-800 ring-1 ring-amber-200">
        Changes only affect the table after you press <b>Recompute scores</b>. The next automatic poll may overwrite a
        manual fixture score if the feed reports a different result.
      </div>

      {/* Fixture picker */}
      <select
        value={selId ?? ''}
        onChange={(e) => {
          const f = fixtures.find((x) => x.id === Number(e.target.value))
          if (f) pick(f)
        }}
        className="mt-4 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-cro-red"
      >
        <option value="">Select a fixture…</option>
        {fixtures.map((f) => (
          <option key={f.id} value={f.id}>
            [{f.stage}] {f.homeName} v {f.awayName} {f.finished ? `(${f.scoreA}-${f.scoreB} FT)` : f.status === 'LIVE' ? '(LIVE)' : ''}
          </option>
        ))}
      </select>

      {sel && (
        <>
          {/* Result editor */}
          <section className="mt-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-sm font-bold text-cro-navy">Score</h2>
            <div className="mt-3 flex items-center justify-center gap-3">
              <span className="w-1/3 truncate text-right text-sm font-semibold text-cro-navy">{sel.homeName}</span>
              <input value={a} onChange={(e) => setA(e.target.value)} inputMode="numeric" className="w-12 rounded-lg border border-slate-300 px-2 py-2 text-center text-sm" />
              <span className="text-slate-400">–</span>
              <input value={b} onChange={(e) => setB(e.target.value)} inputMode="numeric" className="w-12 rounded-lg border border-slate-300 px-2 py-2 text-center text-sm" />
              <span className="w-1/3 truncate text-sm font-semibold text-cro-navy">{sel.awayName}</span>
            </div>
            <label className="mt-3 flex items-center gap-2 text-sm text-cro-navy">
              <input type="checkbox" checked={fin} onChange={(e) => setFin(e.target.checked)} className="h-4 w-4 accent-cro-red" />
              Mark as finished
            </label>
            {sel.stage !== 'GROUP' && (
              <div className="mt-3">
                <div className="text-xs font-semibold text-slate-500">Winner (knockout — incl. penalties)</div>
                <div className="mt-1 flex gap-2">
                  {(['home', 'away', 'none'] as const).map((w) => (
                    <button
                      key={w}
                      onClick={() => setWinner(w)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-bold ring-1 ${winner === w ? 'bg-cro-red text-white ring-cro-red' : 'bg-white text-slate-600 ring-slate-200'}`}
                    >
                      {w === 'home' ? sel.homeName : w === 'away' ? sel.awayName : 'None'}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <button onClick={saveResult} disabled={pending} className="mt-4 w-full rounded-xl bg-cro-navy px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">
              Save score
            </button>
          </section>

          {/* Player stat editor */}
          <section className="mt-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-sm font-bold text-cro-navy">Player stat line</h2>
            <select
              value={pid ?? ''}
              onChange={(e) => setPid(e.target.value ? Number(e.target.value) : null)}
              className="mt-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-cro-red"
            >
              <option value="">{players.length ? 'Select a player…' : 'Loading players…'}</option>
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.position} · {p.name}
                </option>
              ))}
            </select>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="text-sm text-cro-navy">
                Minutes
                <input value={mins} onChange={(e) => setMins(e.target.value)} inputMode="numeric" className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm" />
              </label>
              <label className="text-sm text-cro-navy">
                Goals
                <input value={goals} onChange={(e) => setGoals(e.target.value)} inputMode="numeric" className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm" />
              </label>
            </div>
            <div className="mt-3 flex gap-4">
              <label className="flex items-center gap-2 text-sm text-cro-navy">
                <input type="checkbox" checked={red} onChange={(e) => setRed(e.target.checked)} className="h-4 w-4 accent-cro-red" />
                Red card
              </label>
              <label className="flex items-center gap-2 text-sm text-cro-navy">
                <input type="checkbox" checked={cs} onChange={(e) => setCs(e.target.checked)} className="h-4 w-4 accent-cro-red" />
                Clean sheet
              </label>
            </div>
            <button onClick={saveStat} disabled={pending} className="mt-4 w-full rounded-xl bg-cro-navy px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">
              Save player stat
            </button>
          </section>

          <button onClick={recompute} disabled={pending} className="mt-4 w-full rounded-xl bg-cro-red px-4 py-3 text-sm font-bold text-white hover:bg-cro-red-dark disabled:opacity-50">
            ♻️ Recompute scores
          </button>
        </>
      )}
    </main>
  )
}
