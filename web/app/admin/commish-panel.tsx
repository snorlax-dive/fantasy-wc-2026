'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { setStage, setTournamentLock, setSignupsOpen } from './actions'

const STAGES = [
  { v: 'GROUP', label: 'Group' },
  { v: 'R32', label: 'R32' },
  { v: 'R16', label: 'R16' },
  { v: 'QF', label: 'QF' },
  { v: 'SF', label: 'SF' },
  { v: 'FINAL', label: 'Final' },
]

type Check = { label: string; ok: boolean; detail: string; warn?: boolean }

export function CommishPanel({
  currentStage,
  tournamentLocked,
  signupsOpen,
  counts,
  fixturesByStage,
  readiness = [],
}: {
  currentStage: string
  tournamentLocked: boolean
  signupsOpen: boolean
  counts: { teams: number; players: number; squads: number }
  fixturesByStage: Record<string, { total: number; finished: number }>
  readiness?: Check[]
}) {
  const [stage, setStageLocal] = useState(currentStage)
  const [locked, setLocked] = useState(tournamentLocked)
  const [signups, setSignups] = useState(signupsOpen)
  const [pending, start] = useTransition()
  const [log, setLog] = useState<string[]>([])

  // The stage a re-draft would open into next — re-pricing should target this
  // one, ahead of advancing the round.
  const stageOrder = STAGES.map((s) => s.v)
  const nextStage = stageOrder[Math.min(stageOrder.indexOf(stage) + 1, stageOrder.length - 1)]
  const nextStageLabel = STAGES.find((s) => s.v === nextStage)?.label ?? nextStage

  function toggleLock() {
    start(async () => {
      const res = await setTournamentLock(!locked)
      if (res.ok) {
        setLocked(!locked)
        note(!locked ? '🔒 Game LOCKED — no entries allowed' : '🔓 Game unlocked')
      } else {
        note(`❌ ${res.error}`)
      }
    })
  }

  function toggleSignups() {
    start(async () => {
      const res = await setSignupsOpen(!signups)
      if (res.ok) {
        setSignups(!signups)
        note(!signups ? '✅ Sign-ups OPEN' : '🚫 Sign-ups CLOSED')
      } else {
        note(`❌ ${res.error}`)
      }
    })
  }

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

  const blockers = readiness.filter((c) => !c.ok && !c.warn).length

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-5 pb-24 sm:pb-10">
      <h1 className="text-xl font-extrabold text-cro-navy">Commissioner panel</h1>

      {/* Launch readiness */}
      {readiness.length > 0 && (
        <section
          className={`mt-4 overflow-hidden rounded-2xl shadow-sm ring-1 ${
            blockers === 0 ? 'bg-emerald-50 ring-emerald-200' : 'bg-red-50 ring-red-200'
          }`}
        >
          <h2 className="flex items-center justify-between px-4 py-2 text-sm font-bold text-cro-navy">
            <span>🚦 Launch readiness</span>
            <span className={blockers === 0 ? 'text-emerald-700' : 'text-cro-red'}>
              {blockers === 0 ? 'All clear' : `${blockers} blocker${blockers > 1 ? 's' : ''}`}
            </span>
          </h2>
          <ul className="divide-y divide-white/70 bg-white/60">
            {readiness.map((c) => (
              <li key={c.label} className="flex items-start gap-2 px-4 py-2 text-sm">
                <span className="mt-0.5 shrink-0">{c.ok ? '✅' : c.warn ? '⚠️' : '❌'}</span>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-cro-navy">{c.label}</div>
                  <div className="truncate text-xs text-slate-500">{c.detail}</div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
        <Stat label="Teams" value={counts.teams} />
        <Stat label="Players" value={counts.players} />
        <Stat label="Squads" value={counts.squads} />
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <Link href="/admin/managers" className="rounded-xl bg-white p-3 text-center text-sm font-semibold text-cro-navy shadow-sm ring-1 ring-slate-200 hover:ring-cro-red">
          👥 Managers
        </Link>
        <Link href="/admin/results" className="rounded-xl bg-white p-3 text-center text-sm font-semibold text-cro-navy shadow-sm ring-1 ring-slate-200 hover:ring-cro-red">
          ✏️ Fix results
        </Link>
      </div>
      <div className="mt-2 rounded-2xl bg-white p-3 text-xs text-slate-500 shadow-sm ring-1 ring-slate-200">
        Fixtures by stage:{' '}
        {Object.keys(fixturesByStage).length === 0
          ? 'none'
          : Object.entries(fixturesByStage)
              .map(([s, c]) => `${s} ${c.finished}/${c.total}`)
              .join(' · ')}
      </div>

      {/* Freeze / kill-switch */}
      <section className={`mt-4 rounded-2xl p-4 shadow-sm ring-1 ${locked ? 'bg-red-50 ring-red-200' : 'bg-white ring-slate-200'}`}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-cro-navy">{locked ? '🔒 Game is LOCKED' : '🔓 Game is open'}</h2>
            <p className="mt-1 text-xs text-slate-500">
              Instantly freeze all squads, predictions, brackets &amp; blocks (in addition to the automatic
              kickoff locks).
            </p>
          </div>
          <button
            onClick={toggleLock}
            disabled={pending}
            className={`shrink-0 rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-50 ${
              locked ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-cro-red hover:bg-cro-red-dark'
            }`}
          >
            {locked ? 'Unlock' : 'Lock now'}
          </button>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-200 pt-3">
          <div>
            <h3 className="text-sm font-bold text-cro-navy">{signups ? 'Sign-ups open' : '🚫 Sign-ups closed'}</h3>
            <p className="mt-1 text-xs text-slate-500">
              New players need the invite code; close this once everyone has joined.
            </p>
          </div>
          <button
            onClick={toggleSignups}
            disabled={pending}
            className={`shrink-0 rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-50 ${
              signups ? 'bg-cro-red hover:bg-cro-red-dark' : 'bg-emerald-600 hover:bg-emerald-500'
            }`}
          >
            {signups ? 'Close sign-ups' : 'Open sign-ups'}
          </button>
        </div>
      </section>

      {/* Round control */}
      <section className="mt-6 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-sm font-bold text-cro-navy">
          Current round: <span className="text-cro-red">{stage}</span>
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Advancing the round opens re-draft + blocks for that stage. Re-seed fixtures and re-price
          players for the next stage first, so the new matchups and budgets are ready before managers draft.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {STAGES.map((s) => (
            <button
              key={s.v}
              onClick={() => changeStage(s.v)}
              disabled={pending}
              className={`rounded-lg px-3 py-1.5 text-sm font-bold transition ${
                stage === s.v
                  ? 'bg-cro-red text-white'
                  : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
              } disabled:opacity-50`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="mt-3 border-t border-slate-200 pt-3">
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400">
            Re-price players for {nextStageLabel}
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Recomputes price + projected points from each player&apos;s pre-tournament projection blended
            with their form so far this tournament. Preview before committing — it overwrites prices.
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Op
              label={`Preview re-price (${nextStageLabel})`}
              onClick={() => runOp(`reprice preview ${nextStage}`, `/api/admin/reprice?stage=${nextStage}&dry=1`)}
              pending={pending}
            />
            <Op
              label={`Re-price now (${nextStageLabel})`}
              onClick={() => runOp(`reprice ${nextStage}`, `/api/admin/reprice?stage=${nextStage}`)}
              pending={pending}
            />
          </div>
        </div>
      </section>

      {/* Data ops */}
      <section className="mt-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-sm font-bold text-cro-navy">Data &amp; scoring</h2>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Op label="Re-seed teams & fixtures" onClick={() => runOp('seed base', '/api/admin/seed?step=base&season=2026')} pending={pending} />
          <Op label="Re-seed squads (players)" onClick={() => runOp('seed players', '/api/admin/seed?step=players&season=2026')} pending={pending} />
          <Op label="Poll results now" onClick={() => runOp('poll', '/api/admin/poll?limit=24')} pending={pending} />
          <Op label="Recompute scores now" onClick={() => runOp('score', '/api/admin/score')} pending={pending} />
        </div>
      </section>

      {/* Notifications */}
      <section className="mt-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-sm font-bold text-cro-navy">Email notifications</h2>
        <p className="mt-1 text-xs text-slate-500">
          Lock reminders go out automatically ~6h before each round locks (only to managers who haven&apos;t set a
          squad). Use these to send manually.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Op label="Send standings digest" onClick={() => runOp('digest', '/api/admin/notify?type=digest')} pending={pending} />
          <Op label="Send lock reminder now" onClick={() => runOp('reminder', '/api/admin/notify?type=lock-reminder')} pending={pending} />
        </div>
      </section>

      {/* Log */}
      {log.length > 0 && (
        <section className="mt-4 rounded-2xl bg-slate-900 p-3 font-mono text-xs text-slate-300">
          {log.map((l, i) => (
            <div key={i} className="truncate">
              {l}
            </div>
          ))}
        </section>
      )}
    </main>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="text-lg font-extrabold tabular-nums text-cro-navy">{value}</div>
    </div>
  )
}

function Op({ label, onClick, pending }: { label: string; onClick: () => void; pending: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={pending}
      className="rounded-lg bg-white px-3 py-2 text-left text-sm text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-50"
    >
      {label}
    </button>
  )
}
