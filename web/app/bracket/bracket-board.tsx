'use client'

import Link from 'next/link'
import { useMemo, useState, useTransition } from 'react'
import { saveBracket } from './actions'

export type TeamRow = { id: number; name: string; flag: string | null }
export type PlayerOption = { id: number; name: string; team: string }

const LEVELS = [
  { v: 0, label: 'Out in groups' },
  { v: 1, label: 'Round of 16' },
  { v: 2, label: 'Quarter-final' },
  { v: 3, label: 'Semi-final' },
  { v: 4, label: 'Final' },
  { v: 5, label: 'Champion 🏆' },
]

export function BracketBoard({
  teams,
  players,
  initialFurthest,
  initialGoldenBoot,
  locked,
}: {
  teams: TeamRow[]
  players: PlayerOption[]
  initialFurthest: Record<number, number>
  initialGoldenBoot: number | null
  locked: boolean
}) {
  const [furthest, setFurthest] = useState<Record<number, number>>(initialFurthest)
  const [goldenBoot, setGoldenBoot] = useState<number | null>(initialGoldenBoot)
  const [q, setQ] = useState('')
  const [gbQuery, setGbQuery] = useState('')
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<{ ok?: boolean; error?: string } | null>(null)

  const counts = useMemo(() => {
    const vals = Object.values(furthest)
    const atLeast = (n: number) => vals.filter((l) => l >= n).length
    return { r16: atLeast(1), qf: atLeast(2), sf: atLeast(3), final: atLeast(4), champ: atLeast(5) }
  }, [furthest])

  const overLimit =
    counts.r16 > 16 || counts.qf > 8 || counts.sf > 4 || counts.final > 2 || counts.champ > 1

  const gbName = goldenBoot ? players.find((p) => p.id === goldenBoot) : null

  const filteredTeams = useMemo(
    () => teams.filter((t) => q === '' || t.name.toLowerCase().includes(q.toLowerCase())),
    [teams, q]
  )
  const gbResults = useMemo(() => {
    if (gbQuery.length < 2) return []
    const s = gbQuery.toLowerCase()
    return players
      .filter((p) => p.name.toLowerCase().includes(s) || p.team.toLowerCase().includes(s))
      .slice(0, 8)
  }, [players, gbQuery])

  function setLevel(teamId: number, level: number) {
    if (locked) return
    setMsg(null)
    setFurthest((prev) => {
      const next = { ...prev }
      if (level === 0) delete next[teamId]
      else next[teamId] = level
      // enforce single champion: demote any other champion to Final
      if (level === 5) {
        for (const k of Object.keys(next)) {
          const id = Number(k)
          if (id !== teamId && next[id] === 5) next[id] = 4
        }
      }
      return next
    })
  }

  function onSave() {
    start(async () => {
      const res = await saveBracket({
        furthest: Object.fromEntries(Object.entries(furthest)),
        goldenBoot,
      })
      setMsg(res)
    })
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-3xl px-4 py-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Bracket &amp; awards</h1>
          <Link href="/" className="text-sm text-zinc-400 hover:text-zinc-200">
            ← Home
          </Link>
        </div>
        <p className="mt-1 text-sm text-zinc-400">
          For each team, pick how far they go. R16 +1 · QF +2 · SF +4 · Final +8 · Champion +15 ·
          Golden Boot +10. Locks at the first kickoff.
        </p>

        {locked && (
          <div className="mt-4 rounded-lg border border-amber-900 bg-amber-950/40 p-3 text-sm text-amber-300">
            The bracket is locked — read-only.
          </div>
        )}

        <div className="mt-4 grid grid-cols-5 gap-2 text-center text-xs">
          <Counter label="R16" value={counts.r16} max={16} />
          <Counter label="QF" value={counts.qf} max={8} />
          <Counter label="SF" value={counts.sf} max={4} />
          <Counter label="Final" value={counts.final} max={2} />
          <Counter label="Champ" value={counts.champ} max={1} />
        </div>

        {/* Golden boot */}
        <div className="mt-5 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <h2 className="text-sm font-semibold">Golden Boot (top scorer) — +10</h2>
          {gbName ? (
            <div className="mt-2 flex items-center gap-2 text-sm">
              <span className="rounded bg-amber-950/40 px-2 py-1 text-amber-300">
                {gbName.name} · {gbName.team}
              </span>
              {!locked && (
                <button onClick={() => setGoldenBoot(null)} className="text-xs text-zinc-500 hover:text-red-400">
                  clear
                </button>
              )}
            </div>
          ) : (
            !locked && (
              <div className="mt-2">
                <input
                  value={gbQuery}
                  onChange={(e) => setGbQuery(e.target.value)}
                  placeholder="Search a player…"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm outline-none focus:border-emerald-500"
                />
                {gbResults.length > 0 && (
                  <ul className="mt-1 divide-y divide-zinc-900 rounded-lg border border-zinc-800">
                    {gbResults.map((p) => (
                      <li key={p.id}>
                        <button
                          onClick={() => {
                            setGoldenBoot(p.id)
                            setGbQuery('')
                          }}
                          className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-zinc-800"
                        >
                          <span>{p.name}</span>
                          <span className="text-xs text-zinc-500">{p.team}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          )}
        </div>

        {/* Teams */}
        <div className="mt-5">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter teams…"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm outline-none focus:border-emerald-500"
          />
          <ul className="mt-2 divide-y divide-zinc-900 rounded-xl border border-zinc-800">
            {filteredTeams.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-sm">{t.name}</span>
                <select
                  value={furthest[t.id] ?? 0}
                  disabled={locked}
                  onChange={(e) => setLevel(t.id, Number(e.target.value))}
                  className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs outline-none focus:border-emerald-500 disabled:opacity-50"
                >
                  {LEVELS.map((l) => (
                    <option key={l.v} value={l.v}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        </div>

        {msg?.error && <p className="mt-3 text-sm text-red-400">{msg.error}</p>}
        {msg?.ok && <p className="mt-3 text-sm text-emerald-400">Bracket saved! ✅</p>}
        {overLimit && <p className="mt-3 text-sm text-red-400">You&apos;re over a round limit — trim your picks.</p>}

        {!locked && (
          <button
            onClick={onSave}
            disabled={pending || overLimit}
            className="mt-4 w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-40"
          >
            {pending ? 'Saving…' : 'Save bracket'}
          </button>
        )}
      </div>
    </main>
  )
}

function Counter({ label, value, max }: { label: string; value: number; max: number }) {
  const over = value > max
  return (
    <div className={`rounded-lg border p-2 ${over ? 'border-red-800 bg-red-950/30' : 'border-zinc-800 bg-zinc-900/40'}`}>
      <div className="text-zinc-500">{label}</div>
      <div className={`font-semibold tabular-nums ${over ? 'text-red-400' : 'text-zinc-100'}`}>
        {value}/{max}
      </div>
    </div>
  )
}
