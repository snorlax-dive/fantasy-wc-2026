'use client'

import { useMemo, useState, useTransition } from 'react'
import { saveSquad } from './actions'

export type Pos = 'GK' | 'DEF' | 'MID' | 'FWD'
export type Player = {
  id: number
  name: string
  position: Pos
  price: number
  team: string
  flag: string | null
  points: number
}
export type Formation = Record<Pos, number>

const POSES: Pos[] = ['GK', 'DEF', 'MID', 'FWD']
const FORMATIONS = ['3-4-3', '3-5-2', '4-3-3', '4-4-2', '4-5-1', '5-3-2', '5-4-1']

function parse(f: string): Formation {
  const [d, m, fw] = f.split('-').map(Number)
  return { GK: 1, DEF: d, MID: m, FWD: fw }
}
function fmtString(c: Formation) {
  return `${c.DEF}-${c.MID}-${c.FWD}`
}
function surname(name: string) {
  const parts = name.trim().split(' ')
  return parts.length > 1 ? parts[parts.length - 1] : name
}

export function SquadBuilder({
  players,
  budgetCap,
  initialPicks,
  locked,
  stageLabel,
}: {
  players: Player[]
  budgetCap: number
  initialPicks: { player_id: number; is_captain: boolean }[]
  locked: boolean
  stageLabel?: string
}) {
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players])
  const [selected, setSelected] = useState<number[]>(initialPicks.map((p) => p.player_id))
  const [captain, setCaptain] = useState<number | null>(
    initialPicks.find((p) => p.is_captain)?.player_id ?? null
  )
  const [formationStr, setFormationStr] = useState<string>(() => {
    const c: Formation = { GK: 0, DEF: 0, MID: 0, FWD: 0 }
    for (const pk of initialPicks) {
      const p = byId.get(pk.player_id)
      if (p) c[p.position]++
    }
    const s = fmtString(c)
    return FORMATIONS.includes(s) ? s : '4-3-3'
  })
  const formation = parse(formationStr)
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
        ),
    [players, tab, q]
  )

  function onSave() {
    start(async () => {
      const res = await saveSquad({ playerIds: selected, captainId: captain })
      setMsg(res)
    })
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-5 pb-28 sm:pb-10">
      <div>
        <h1 className="text-xl font-extrabold text-cro-navy">Build your squad</h1>
        {stageLabel && <p className="text-xs font-semibold text-cro-red">{stageLabel}</p>}
      </div>

      {locked && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Squads are locked for this round — read-only.
        </div>
      )}

      {/* Stats */}
      <div className="mt-4 grid grid-cols-4 gap-2">
        <Stat label="Players" value={`${selected.length}/11`} ok={selected.length === 11} />
        <Stat label="Shape" value={`${counts.DEF}-${counts.MID}-${counts.FWD}`} ok={formationOk} />
        <Stat label="Spent" value={`€${spend.toFixed(1)}`} ok={remaining >= -1e-9} />
        <Stat label="Left" value={`€${remaining.toFixed(1)}`} ok={remaining >= -1e-9} />
      </div>

      {/* Formation picker */}
      {!locked && (
        <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1">
          <span className="shrink-0 text-xs font-semibold text-slate-400">Formation</span>
          {FORMATIONS.map((f) => (
            <button
              key={f}
              onClick={() => setFormationStr(f)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold transition ${
                formationStr === f
                  ? 'bg-cro-navy text-white'
                  : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      )}

      {/* Pitch */}
      <div className="pitch mt-3 rounded-2xl p-3 shadow-inner ring-1 ring-black/10">
        {POSES.map((pos) => {
          const here = selectedPlayers.filter((p) => p.position === pos)
          const empties = Math.max(0, formation[pos] - here.length)
          return (
            <div key={pos} className="flex flex-wrap justify-center gap-3 py-2">
              {here.map((p) => (
                <PitchChip
                  key={p.id}
                  p={p}
                  isCaptain={captain === p.id}
                  locked={locked}
                  onCaptain={() => !locked && setCaptain(p.id)}
                  onRemove={() => toggle(p)}
                />
              ))}
              {Array.from({ length: empties }).map((_, i) => (
                <EmptyChip key={`${pos}-${i}`} pos={pos} />
              ))}
            </div>
          )
        })}
      </div>

      {msg?.error && <p className="mt-3 text-sm text-red-600">{msg.error}</p>}
      {msg?.ok && <p className="mt-3 text-sm text-emerald-600">Squad saved! ✅</p>}

      {!locked && (
        <button
          onClick={onSave}
          disabled={!canSave || pending}
          className="mt-3 w-full rounded-xl bg-cro-red px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-cro-red-dark disabled:opacity-40"
        >
          {pending ? 'Saving…' : 'Save squad'}
        </button>
      )}

      {/* Player pool */}
      {!locked && (
        <section className="mt-6">
          <div className="flex flex-wrap items-center gap-2">
            {(['ALL', ...POSES] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  tab === t ? 'bg-cro-navy text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
                }`}
              >
                {t === 'ALL' ? 'All' : t}
              </button>
            ))}
            <span className="ml-auto text-xs font-medium text-slate-400">{filtered.length} players</span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search…"
              className="w-36 rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm outline-none focus:border-cro-red"
            />
          </div>

          <div className="mt-3 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
            <div className="flex items-center gap-3 border-b border-slate-100 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
              <span className="w-9 text-center">Pos</span>
              <span className="flex-1">Player</span>
              <span className="w-10 text-right">Pts</span>
              <span className="w-12 text-right">Price</span>
              <span className="w-16" />
            </div>
            <ul className="divide-y divide-slate-100">
              {filtered.map((p) => {
                const isSel = selected.includes(p.id)
                const slotFull = !isSel && counts[p.position] >= formation[p.position]
                const disabled = (slotFull || selected.length >= 11) && !isSel
                return (
                  <li key={p.id} className="flex items-center gap-3 px-3 py-2">
                    <span className="w-9 text-center text-[10px] font-bold text-slate-400">{p.position}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-cro-navy">{p.name}</div>
                      <div className="truncate text-xs text-slate-400">{p.team}</div>
                    </div>
                    <span className="w-10 text-right text-sm font-bold tabular-nums text-cro-blue">{p.points}</span>
                    <span className="w-12 text-right text-sm font-semibold tabular-nums text-slate-700">€{p.price.toFixed(1)}</span>
                    <button
                      onClick={() => toggle(p)}
                      disabled={disabled}
                      className={`w-16 rounded-lg px-2 py-1 text-xs font-bold transition ${
                        isSel
                          ? 'bg-red-100 text-red-600 hover:bg-red-200'
                          : disabled
                            ? 'bg-slate-100 text-slate-400'
                            : 'bg-cro-red text-white hover:bg-cro-red-dark'
                      }`}
                    >
                      {isSel ? 'Remove' : slotFull ? 'Full' : 'Add'}
                    </button>
                  </li>
                )
              })}
              {filtered.length === 0 && (
                <li className="px-3 py-6 text-center text-sm text-slate-400">No players match.</li>
              )}
            </ul>
          </div>
        </section>
      )}
    </main>
  )
}

function PitchChip({
  p,
  isCaptain,
  locked,
  onCaptain,
  onRemove,
}: {
  p: Player
  isCaptain: boolean
  locked: boolean
  onCaptain: () => void
  onRemove: () => void
}) {
  return (
    <div className="relative flex w-16 flex-col items-center">
      {!locked && (
        <button
          onClick={onRemove}
          title="Remove"
          className="absolute -right-1 -top-1 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-white text-[10px] font-bold text-slate-500 shadow ring-1 ring-slate-200"
        >
          ✕
        </button>
      )}
      <button
        onClick={onCaptain}
        title="Set captain"
        className={`flex h-9 w-9 items-center justify-center rounded-lg text-xs font-extrabold shadow ${
          isCaptain ? 'bg-cro-navy text-white ring-2 ring-yellow-300' : 'bg-white text-cro-red'
        }`}
      >
        {isCaptain ? 'C' : p.position}
      </button>
      <div className="mt-1 w-full truncate rounded bg-white/95 px-1 text-center text-[10px] font-semibold text-cro-navy">
        {surname(p.name)}
      </div>
      <div className="text-[10px] font-medium text-white">€{p.price.toFixed(1)}</div>
    </div>
  )
}

function EmptyChip({ pos }: { pos: Pos }) {
  return (
    <div className="flex w-16 flex-col items-center opacity-70">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg border-2 border-dashed border-white/60 text-sm text-white/80">
        +
      </div>
      <div className="mt-1 text-[10px] font-medium text-white/80">{pos}</div>
    </div>
  )
}

function Stat({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="rounded-xl bg-white p-2.5 text-center shadow-sm ring-1 ring-slate-200">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-0.5 text-base font-extrabold tabular-nums ${ok ? 'text-cro-navy' : 'text-red-600'}`}>
        {value}
      </div>
    </div>
  )
}
