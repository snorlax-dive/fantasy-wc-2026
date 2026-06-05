'use client'

import Link from 'next/link'
import { useMemo, useState, useTransition } from 'react'
import { saveSquad } from './actions'

export type Pos = 'GK' | 'DEF' | 'MID' | 'FWD'
export type Player = { id: number; name: string; position: Pos; price: number; team: string; flag: string | null }
export type Formation = Record<Pos, number>

const POSES: Pos[] = ['GK', 'DEF', 'MID', 'FWD']
const POS_LABEL: Record<Pos, string> = { GK: 'Goalkeepers', DEF: 'Defenders', MID: 'Midfielders', FWD: 'Forwards' }

export function SquadBuilder({
  players,
  budgetCap,
  formation,
  initialPicks,
  locked,
  stageLabel,
}: {
  players: Player[]
  budgetCap: number
  formation: Formation
  initialPicks: { player_id: number; is_captain: boolean }[]
  locked: boolean
  stageLabel?: string
}) {
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players])
  const [selected, setSelected] = useState<number[]>(initialPicks.map((p) => p.player_id))
  const [captain, setCaptain] = useState<number | null>(
    initialPicks.find((p) => p.is_captain)?.player_id ?? null
  )
  const [tab, setTab] = useState<Pos | 'ALL'>('ALL')
  const [q, setQ] = useState('')
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<{ ok?: boolean; error?: string } | null>(null)

  const selectedPlayers = useMemo(
    () => selected.map((id) => byId.get(id)).filter((p): p is Player => !!p),
    [selected, byId]
  )
  const counts = useMemo(() => {
    const c: Formation = { GK: 0, DEF: 0, MID: 0, FWD: 0 }
    for (const p of selectedPlayers) c[p.position]++
    return c
  }, [selectedPlayers])

  const spend = selectedPlayers.reduce((s, p) => s + p.price, 0)
  const remaining = budgetCap - spend
  const formationOk = POSES.every((pos) => counts[pos] === formation[pos])
  const canSave = !locked && selected.length === 11 && formationOk && remaining >= -1e-9 && captain != null

  function toggle(p: Player) {
    if (locked) return
    setMsg(null)
    if (selected.includes(p.id)) {
      setSelected(selected.filter((id) => id !== p.id))
      if (captain === p.id) setCaptain(null)
      return
    }
    if (counts[p.position] >= formation[p.position]) return
    if (selected.length >= 11) return
    setSelected([...selected, p.id])
  }

  const filtered = useMemo(
    () =>
      players
        .filter(
          (p) =>
            (tab === 'ALL' || p.position === tab) &&
            (q === '' ||
              p.name.toLowerCase().includes(q.toLowerCase()) ||
              p.team.toLowerCase().includes(q.toLowerCase()))
        )
        .slice(0, 100),
    [players, tab, q]
  )

  function onSave() {
    start(async () => {
      const res = await saveSquad({ playerIds: selected, captainId: captain })
      setMsg(res)
    })
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-5xl px-4 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Build your squad</h1>
            {stageLabel && <p className="text-xs text-emerald-400">{stageLabel}</p>}
          </div>
          <Link href="/" className="text-sm text-zinc-400 hover:text-zinc-200">
            ← Home
          </Link>
        </div>

        {locked && (
          <div className="mt-4 rounded-lg border border-amber-900 bg-amber-950/40 p-3 text-sm text-amber-300">
            Squads are locked — the tournament has started. This is a read-only view.
          </div>
        )}

        {/* Budget + formation summary */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Players" value={`${selected.length}/11`} ok={selected.length === 11} />
          <Stat
            label="Formation"
            value={`${counts.GK}-${counts.DEF}-${counts.MID}-${counts.FWD}`}
            ok={formationOk}
          />
          <Stat label="Spent" value={`€${spend.toFixed(1)}m`} ok={remaining >= -1e-9} />
          <Stat
            label="Remaining"
            value={`€${remaining.toFixed(1)}m`}
            ok={remaining >= -1e-9}
          />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
          {/* Player pool */}
          <section>
            <div className="flex flex-wrap items-center gap-2">
              {(['ALL', ...POSES] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    tab === t ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                  }`}
                >
                  {t === 'ALL' ? 'All' : t}
                </button>
              ))}
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search player or team…"
                className="ml-auto w-44 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1 text-sm outline-none focus:border-emerald-500"
              />
            </div>

            <ul className="mt-3 divide-y divide-zinc-900 rounded-xl border border-zinc-800">
              {filtered.map((p) => {
                const isSel = selected.includes(p.id)
                const slotFull = !isSel && counts[p.position] >= formation[p.position]
                const wouldOverflow = !isSel && selected.length >= 11
                const disabled = locked || slotFull || wouldOverflow
                return (
                  <li key={p.id} className="flex items-center gap-3 px-3 py-2">
                    <span className="w-8 text-xs font-semibold text-zinc-500">{p.position}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm">{p.name}</div>
                      <div className="truncate text-xs text-zinc-500">{p.team}</div>
                    </div>
                    <span className="text-sm tabular-nums text-zinc-300">€{p.price.toFixed(1)}</span>
                    <button
                      onClick={() => toggle(p)}
                      disabled={disabled}
                      className={`w-16 rounded-lg px-2 py-1 text-xs font-semibold ${
                        isSel
                          ? 'bg-red-600/80 text-white hover:bg-red-600'
                          : disabled
                            ? 'bg-zinc-800 text-zinc-600'
                            : 'bg-emerald-600 text-white hover:bg-emerald-500'
                      }`}
                    >
                      {isSel ? 'Remove' : slotFull ? 'Full' : 'Add'}
                    </button>
                  </li>
                )
              })}
              {filtered.length === 0 && (
                <li className="px-3 py-6 text-center text-sm text-zinc-500">No players match.</li>
              )}
            </ul>
          </section>

          {/* Your XI */}
          <section className="lg:sticky lg:top-6 lg:self-start">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <h2 className="text-sm font-semibold text-zinc-300">Your XI — tap ★ to set captain</h2>
              <div className="mt-3 space-y-3">
                {POSES.map((pos) => (
                  <div key={pos}>
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      {POS_LABEL[pos]} ({counts[pos]}/{formation[pos]})
                    </div>
                    <ul className="mt-1 space-y-1">
                      {selectedPlayers
                        .filter((p) => p.position === pos)
                        .map((p) => (
                          <li key={p.id} className="flex items-center gap-2 text-sm">
                            <button
                              onClick={() => !locked && setCaptain(p.id)}
                              title="Set captain"
                              className={captain === p.id ? 'text-amber-400' : 'text-zinc-600 hover:text-zinc-400'}
                            >
                              ★
                            </button>
                            <span className="min-w-0 flex-1 truncate">{p.name}</span>
                            <span className="tabular-nums text-zinc-400">€{p.price.toFixed(1)}</span>
                            {!locked && (
                              <button
                                onClick={() => toggle(p)}
                                className="text-zinc-600 hover:text-red-400"
                                title="Remove"
                              >
                                ✕
                              </button>
                            )}
                          </li>
                        ))}
                      {counts[pos] === 0 && <li className="text-xs text-zinc-600">— none —</li>}
                    </ul>
                  </div>
                ))}
              </div>

              {msg?.error && <p className="mt-3 text-sm text-red-400">{msg.error}</p>}
              {msg?.ok && <p className="mt-3 text-sm text-emerald-400">Squad saved! ✅</p>}

              {!locked && (
                <button
                  onClick={onSave}
                  disabled={!canSave || pending}
                  className="mt-4 w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-40"
                >
                  {pending ? 'Saving…' : 'Save squad'}
                </button>
              )}
              {!canSave && !locked && (
                <p className="mt-2 text-center text-xs text-zinc-500">
                  Fill all 11 slots in formation, stay within budget, and pick a captain to save.
                </p>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}

function Stat({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className={`mt-0.5 text-lg font-semibold tabular-nums ${ok ? 'text-zinc-100' : 'text-red-400'}`}>
        {value}
      </div>
    </div>
  )
}
