'use client'

import { useMemo, useState, useTransition } from 'react'
import { saveBracket } from './actions'
import { Countdown } from '@/components/countdown'
import { toast } from '@/components/toast'

export type TeamRow = { id: number; name: string; flag: string | null }
export type PlayerOption = { id: number; name: string; team: string }

// Sections shown top-down; a team sits at the FURTHEST round you think it reaches.
const SECTIONS = [
  { level: 5, label: 'Champion', emoji: '🏆', accent: 'bg-amber-100 text-amber-900 ring-amber-300' },
  { level: 4, label: 'Final (runner-up)', emoji: '🥈', accent: 'bg-slate-100 text-slate-800 ring-slate-300' },
  { level: 3, label: 'Semi-finals', emoji: '', accent: 'bg-red-50 text-cro-red ring-red-200' },
  { level: 2, label: 'Quarter-finals', emoji: '', accent: 'bg-blue-50 text-cro-blue ring-blue-200' },
  { level: 1, label: 'Round of 16', emoji: '', accent: 'bg-slate-50 text-slate-700 ring-slate-200' },
]

export function BracketBoard({
  teams,
  players,
  initialFurthest,
  initialGoldenBoot,
  locked,
  lockAt,
}: {
  teams: TeamRow[]
  players: PlayerOption[]
  initialFurthest: Record<number, number>
  initialGoldenBoot: number | null
  locked: boolean
  lockAt?: string | null
}) {
  const [furthest, setFurthest] = useState<Record<number, number>>(initialFurthest)
  const [goldenBoot, setGoldenBoot] = useState<number | null>(initialGoldenBoot)
  const [openPicker, setOpenPicker] = useState<number | null>(null)
  const [pickQ, setPickQ] = useState('')
  const [gbQuery, setGbQuery] = useState('')
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<{ ok?: boolean; error?: string } | null>(null)

  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams])

  const counts = useMemo(() => {
    const vals = Object.values(furthest)
    const atLeast = (n: number) => vals.filter((l) => l >= n).length
    return { r16: atLeast(1), qf: atLeast(2), sf: atLeast(3), final: atLeast(4), champ: atLeast(5) }
  }, [furthest])
  const overLimit =
    counts.r16 > 16 || counts.qf > 8 || counts.sf > 4 || counts.final > 2 || counts.champ > 1

  const teamsAt = (level: number) =>
    Object.entries(furthest)
      .filter(([, l]) => l === level)
      .map(([id]) => teamById.get(Number(id)))
      .filter((t): t is TeamRow => !!t)
      .sort((a, b) => a.name.localeCompare(b.name))

  function setLevel(teamId: number, level: number) {
    if (locked) return
    setMsg(null)
    setFurthest((prev) => {
      const next = { ...prev }
      if (level === 0) delete next[teamId]
      else next[teamId] = level
      if (level === 5) {
        for (const k of Object.keys(next)) {
          const id = Number(k)
          if (id !== teamId && next[id] === 5) next[id] = 4
        }
      }
      return next
    })
  }

  const pickResults = useMemo(() => {
    const s = pickQ.toLowerCase()
    return teams.filter((t) => s === '' || t.name.toLowerCase().includes(s)).slice(0, 10)
  }, [teams, pickQ])

  const gbName = goldenBoot ? players.find((p) => p.id === goldenBoot) : null
  const gbResults = useMemo(() => {
    if (gbQuery.length < 2) return []
    const s = gbQuery.toLowerCase()
    return players.filter((p) => p.name.toLowerCase().includes(s) || p.team.toLowerCase().includes(s)).slice(0, 8)
  }, [players, gbQuery])

  function onSave() {
    start(async () => {
      const res = await saveBracket({ furthest: Object.fromEntries(Object.entries(furthest)), goldenBoot })
      setMsg(res)
      toast(res.ok ? 'Bracket saved ✅' : res.error ?? 'Could not save', res.ok ? 'ok' : 'err')
    })
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-5 pb-24 sm:pb-10">
      <h1 className="text-xl font-extrabold text-cro-navy">Bracket &amp; awards</h1>
      <p className="mt-1 text-xs text-slate-500">
        Place each country at the furthest round you think they reach. R16 +1 · QF +2 · SF +4 · Final +8 ·
        Champion +15 · Golden Boot +10.
      </p>
      {!locked && (
        <div className="mt-2 inline-block rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800 ring-1 ring-amber-200">
          {lockAt ? (
            <>⏰ Editable through the group stage — locks when the knockouts begin, in <Countdown to={lockAt} /></>
          ) : (
            <>⏰ Editable through the group stage — locks when the knockouts begin.</>
          )}
        </div>
      )}

      {locked && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          The bracket is locked — read-only.
        </div>
      )}

      {/* cumulative limit counters */}
      <div className="mt-4 grid grid-cols-5 gap-2 text-center text-xs">
        <Counter label="R16" value={counts.r16} max={16} />
        <Counter label="QF" value={counts.qf} max={8} />
        <Counter label="SF" value={counts.sf} max={4} />
        <Counter label="Final" value={counts.final} max={2} />
        <Counter label="Champ" value={counts.champ} max={1} />
      </div>

      {/* visual round sections */}
      <div className="mt-4 space-y-3">
        {SECTIONS.map((sec) => {
          const here = teamsAt(sec.level)
          const isOpen = openPicker === sec.level
          return (
            <div key={sec.level} className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
              <div className="flex items-center justify-between px-4 pt-3">
                <h2 className="text-sm font-bold text-cro-navy">
                  {sec.emoji} {sec.label}
                </h2>
                {!locked && (
                  <button
                    onClick={() => {
                      setOpenPicker(isOpen ? null : sec.level)
                      setPickQ('')
                    }}
                    className="rounded-full bg-cro-red px-2.5 py-1 text-xs font-bold text-white hover:bg-cro-red-dark"
                  >
                    {isOpen ? 'Close' : '+ Add'}
                  </button>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5 px-4 pb-3 pt-2">
                {here.map((t) => (
                  <span
                    key={t.id}
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${sec.accent}`}
                  >
                    {t.name}
                    {!locked && (
                      <button onClick={() => setLevel(t.id, 0)} className="ml-0.5 text-current/60 hover:text-red-600">
                        ✕
                      </button>
                    )}
                  </span>
                ))}
                {here.length === 0 && <span className="text-xs text-slate-300">— no teams —</span>}
              </div>

              {isOpen && !locked && (
                <div className="border-t border-slate-100 p-3">
                  <input
                    value={pickQ}
                    onChange={(e) => setPickQ(e.target.value)}
                    autoFocus
                    placeholder="Search a country…"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-cro-red"
                  />
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {pickResults.map((t) => {
                      const cur = furthest[t.id]
                      return (
                        <button
                          key={t.id}
                          onClick={() => {
                            setLevel(t.id, sec.level)
                            setOpenPicker(null)
                          }}
                          className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-cro-red hover:text-white"
                        >
                          {t.name}
                          {cur ? <span className="ml-1 text-[10px] text-slate-400">·moved</span> : null}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Golden boot */}
      <div className="mt-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-sm font-bold text-cro-navy">⚽ Golden Boot — +10</h2>
        {gbName ? (
          <div className="mt-2 flex items-center gap-2 text-sm">
            <span className="rounded bg-amber-50 px-2 py-1 font-semibold text-amber-800 ring-1 ring-amber-200">
              {gbName.name} · {gbName.team}
            </span>
            {!locked && (
              <button onClick={() => setGoldenBoot(null)} className="text-xs text-slate-400 hover:text-red-600">
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
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-cro-red"
              />
              {gbResults.length > 0 && (
                <ul className="mt-1 divide-y divide-slate-100 overflow-hidden rounded-lg ring-1 ring-slate-200">
                  {gbResults.map((p) => (
                    <li key={p.id}>
                      <button
                        onClick={() => {
                          setGoldenBoot(p.id)
                          setGbQuery('')
                        }}
                        className="flex w-full items-center justify-between bg-white px-3 py-1.5 text-left text-sm hover:bg-slate-50"
                      >
                        <span className="text-cro-navy">{p.name}</span>
                        <span className="text-xs text-slate-400">{p.team}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        )}
      </div>

      {msg?.error && <p className="mt-3 text-sm text-red-600">{msg.error}</p>}
      {msg?.ok && <p className="mt-3 text-sm text-emerald-600">Bracket saved! ✅</p>}
      {overLimit && <p className="mt-3 text-sm text-red-600">You&apos;re over a round limit — trim your picks.</p>}

      {!locked && (
        <button
          onClick={onSave}
          disabled={pending || overLimit}
          className="mt-4 w-full rounded-xl bg-cro-red px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-cro-red-dark disabled:opacity-40"
        >
          {pending ? 'Saving…' : 'Save bracket'}
        </button>
      )}
    </main>
  )
}

function Counter({ label, value, max }: { label: string; value: number; max: number }) {
  const over = value > max
  return (
    <div className={`rounded-lg p-2 shadow-sm ring-1 ${over ? 'bg-red-50 ring-red-200' : 'bg-white ring-slate-200'}`}>
      <div className="text-slate-400">{label}</div>
      <div className={`font-extrabold tabular-nums ${over ? 'text-red-600' : 'text-cro-navy'}`}>
        {value}/{max}
      </div>
    </div>
  )
}
