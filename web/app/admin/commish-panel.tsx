'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { setStage } from './actions'

const STAGES = [
  { v: 'GROUP', label: 'Group' },
  { v: 'R32', label: 'R32' },
  { v: 'R16', label: 'R16' },
  { v: 'QF', label: 'QF' },
  { v: 'SF', label: 'SF' },
  { v: 'FINAL', label: 'Final' },
]

export function CommishPanel({
  currentStage,
  counts,
  fixturesByStage,
}: {
  currentStage: string
  counts: { teams: number; players: number; squads: number }
  fixturesByStage: Record<string, { total: number; finished: number }>
}) {
  const [stage, setStageLocal] = useState(currentStage)
  const [pending, start] = useTransition()
  const [log, setLog] = useState<string[]>([])

  function note(s: string) {
    setLog((prev) => [s, ...prev].slice(0, 8))
  }

  function changeStage(v: string) {
    start(async () => {
      const res = await setStage(v)
      if (res.ok) {
        setStageLocal(v)
        note(`✅ Round set to ${v}`)
      } else {
        note(`❌ ${res.error}`)
      }
    })
  }

  // Calls an /api/admin/* route with the commissioner session (cookies). No secret needed.
  function runOp(label: string, path: string) {
    start(async () => {
      note(`⏳ ${label}…`)
      try {
        const res = await fetch(path, { method: 'GET' })
        const json = await res.json()
        note(`${res.ok ? '✅' : '❌'} ${label}: ${JSON.stringify(json)}`)
      } catch (e) {
        note(`❌ ${label}: ${String(e)}`)
      }
    })
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-2xl px-4 py-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Commissioner panel</h1>
          <Link href="/" className="text-sm text-zinc-400 hover:text-zinc-200">
            ← Home
          </Link>
        </div>

        {/* Status */}
        <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
          <Stat label="Teams" value={counts.teams} />
          <Stat label="Players" value={counts.players} />
          <Stat label="Squads" value={counts.squads} />
        </div>
        <div className="mt-2 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 text-xs text-zinc-400">
          Fixtures by stage:{' '}
          {Object.keys(fixturesByStage).length === 0
            ? 'none'
            : Object.entries(fixturesByStage)
                .map(([s, c]) => `${s} ${c.finished}/${c.total}`)
                .join(' · ')}
        </div>

        {/* Round control */}
        <section className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <h2 className="text-sm font-semibold">
            Current round: <span className="text-emerald-400">{stage}</span>
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            Advancing the round opens re-draft + blocks for that stage. Re-seed fixtures first so the
            new matchups exist.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {STAGES.map((s) => (
              <button
                key={s.v}
                onClick={() => changeStage(s.v)}
                disabled={pending}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                  stage === s.v
                    ? 'bg-emerald-600 text-white'
                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                } disabled:opacity-50`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </section>

        {/* Data ops */}
        <section className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <h2 className="text-sm font-semibold">Data &amp; scoring</h2>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Op label="Re-seed teams & fixtures" onClick={() => runOp('seed base', '/api/admin/seed?step=base&season=2026')} pending={pending} />
            <Op label="Re-seed squads (players)" onClick={() => runOp('seed players', '/api/admin/seed?step=players&season=2026')} pending={pending} />
            <Op label="Poll results now" onClick={() => runOp('poll', '/api/admin/poll?limit=24')} pending={pending} />
            <Op label="Recompute scores now" onClick={() => runOp('score', '/api/admin/score')} pending={pending} />
          </div>
        </section>

        {/* Log */}
        {log.length > 0 && (
          <section className="mt-4 rounded-xl border border-zinc-800 bg-black/40 p-3 font-mono text-xs text-zinc-400">
            {log.map((l, i) => (
              <div key={i} className="truncate">
                {l}
              </div>
            ))}
          </section>
        )}
      </div>
    </main>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  )
}

function Op({ label, onClick, pending }: { label: string; onClick: () => void; pending: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={pending}
      className="rounded-lg border border-zinc-700 px-3 py-2 text-left text-sm hover:bg-zinc-800 disabled:opacity-50"
    >
      {label}
    </button>
  )
}
