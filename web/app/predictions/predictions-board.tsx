'use client'

import { useMemo, useState, useTransition } from 'react'
import { savePrediction } from './actions'

export type PlayerLite = { id: number; name: string; position: string }
export type FixtureRow = {
  id: number
  round: string
  kickoff: string
  lockTime: string
  home: { id: number; name: string }
  away: { id: number; name: string }
}
export type ExistingPrediction = {
  fixture_id: number
  pred_a: number | null
  pred_b: number | null
  scorer1: number | null
  scorer2: number | null
  red_card_pred: boolean | null
  is_banker: boolean
}

export type RevealPick = { name: string; crest: string; color: string; a: number | null; b: number | null; banker: boolean }

type CardState = { a: string; b: string; s1: string; s2: string; red: boolean }
type Status = { saving?: boolean; saved?: boolean; error?: string }

export function PredictionsBoard({
  fixtures,
  playersByTeam,
  existing,
  reveal,
}: {
  fixtures: FixtureRow[]
  playersByTeam: Record<number, PlayerLite[]>
  existing: ExistingPrediction[]
  reveal: Record<number, RevealPick[]>
}) {
  const existingByFixture = useMemo(() => new Map(existing.map((e) => [e.fixture_id, e])), [existing])

  const [cards, setCards] = useState<Record<number, CardState>>(() => {
    const init: Record<number, CardState> = {}
    for (const f of fixtures) {
      const e = existingByFixture.get(f.id)
      init[f.id] = {
        a: e?.pred_a != null ? String(e.pred_a) : '',
        b: e?.pred_b != null ? String(e.pred_b) : '',
        s1: e?.scorer1 != null ? String(e.scorer1) : '',
        s2: e?.scorer2 != null ? String(e.scorer2) : '',
        red: e?.red_card_pred === true,
      }
    }
    return init
  })
  const [bankerId, setBankerId] = useState<number | null>(existing.find((e) => e.is_banker)?.fixture_id ?? null)
  const [saved, setSaved] = useState<Set<number>>(
    () => new Set(existing.filter((e) => e.pred_a != null && e.pred_b != null).map((e) => e.fixture_id))
  )
  const [status, setStatus] = useState<Record<number, Status>>({})
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [, startTransition] = useTransition()

  const groups = useMemo(() => {
    const m = new Map<string, FixtureRow[]>()
    for (const f of fixtures) {
      if (!m.has(f.round)) m.set(f.round, [])
      m.get(f.round)!.push(f)
    }
    return [...m.entries()]
  }, [fixtures])

  function setField(id: number, patch: Partial<CardState>) {
    setCards((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))
    setStatus((prev) => ({ ...prev, [id]: {} }))
    setSaved((prev) => {
      if (!prev.has(id)) return prev
      const n = new Set(prev)
      n.delete(id)
      return n
    })
  }
  const toggleExpand = (id: number) =>
    setExpanded((prev) => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  const toggleRound = (r: string) =>
    setCollapsed((prev) => {
      const n = new Set(prev)
      n.has(r) ? n.delete(r) : n.add(r)
      return n
    })

  function save(f: FixtureRow) {
    const c = cards[f.id]
    setStatus((prev) => ({ ...prev, [f.id]: { saving: true } }))
    startTransition(async () => {
      const res = await savePrediction({
        fixtureId: f.id,
        predA: c.a === '' ? null : Number(c.a),
        predB: c.b === '' ? null : Number(c.b),
        scorer1: c.s1 === '' ? null : Number(c.s1),
        scorer2: c.s2 === '' ? null : Number(c.s2),
        redCard: c.red,
        banker: bankerId === f.id,
      })
      setStatus((prev) => ({ ...prev, [f.id]: { saved: res.ok, error: res.error } }))
      if (res.ok) setSaved((prev) => new Set(prev).add(f.id))
    })
  }

  const totalPredicted = saved.size

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-5 pb-24 sm:pb-10">
      <div className="flex items-end justify-between">
        <h1 className="text-xl font-extrabold text-cro-navy">Predictions</h1>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-cro-navy shadow-sm ring-1 ring-slate-200">
          {totalPredicted}/{fixtures.length} predicted
        </span>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Tap a match for scorers, red card &amp; <span className="font-semibold text-amber-700">Banker</span> (2×).
        Each match locks at kickoff.
      </p>

      <div className="mt-4 space-y-4">
        {groups.map(([round, list]) => {
          const done = list.filter((f) => saved.has(f.id)).length
          const isCollapsed = collapsed.has(round)
          return (
            <section key={round} className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
              <button
                onClick={() => toggleRound(round)}
                className="flex w-full items-center justify-between bg-cro-navy px-4 py-2 text-left text-white"
              >
                <span className="text-sm font-bold">{round}</span>
                <span className="flex items-center gap-2 text-xs">
                  <span className={`rounded-full px-2 py-0.5 font-semibold ${done === list.length ? 'bg-emerald-400 text-emerald-950' : 'bg-white/20'}`}>
                    {done}/{list.length}
                  </span>
                  <span className="text-white/70">{isCollapsed ? '▸' : '▾'}</span>
                </span>
              </button>

              {!isCollapsed && (
                <ul className="divide-y divide-slate-100">
                  {list.map((f) => (
                    <MatchRow
                      key={f.id}
                      f={f}
                      state={cards[f.id]}
                      status={status[f.id]}
                      saved={saved.has(f.id)}
                      isBanker={bankerId === f.id}
                      expanded={expanded.has(f.id)}
                      homePlayers={playersByTeam[f.home.id] ?? []}
                      awayPlayers={playersByTeam[f.away.id] ?? []}
                      onField={(patch) => setField(f.id, patch)}
                      onToggle={() => toggleExpand(f.id)}
                      onBanker={(c) => setBankerId(c ? f.id : bankerId === f.id ? null : bankerId)}
                      onSave={() => save(f)}
                      reveal={reveal[f.id] ?? []}
                    />
                  ))}
                </ul>
              )}
            </section>
          )
        })}
      </div>
    </main>
  )
}

function MatchRow({
  f,
  state,
  status,
  saved,
  isBanker,
  expanded,
  homePlayers,
  awayPlayers,
  onField,
  onToggle,
  onBanker,
  onSave,
  reveal,
}: {
  f: FixtureRow
  state: CardState
  status?: Status
  saved: boolean
  isBanker: boolean
  expanded: boolean
  homePlayers: PlayerLite[]
  awayPlayers: PlayerLite[]
  onField: (patch: Partial<CardState>) => void
  onToggle: () => void
  onBanker: (checked: boolean) => void
  onSave: () => void
  reveal: RevealPick[]
}) {
  const locked = new Date(f.lockTime) <= new Date()
  const kickoff = new Date(f.kickoff).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  const dotClass = locked ? 'bg-slate-300' : saved ? 'bg-emerald-500' : state.a && state.b ? 'bg-amber-400' : 'bg-slate-200'

  return (
    <li className={`px-3 py-2 ${isBanker ? 'bg-amber-50' : ''}`}>
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 shrink-0 rounded-full ${dotClass}`} title={saved ? 'Saved' : 'Not saved'} />
        <span className="flex-1 truncate text-right text-sm font-semibold text-cro-navy">{f.home.name}</span>
        <input
          inputMode="numeric"
          value={state.a}
          disabled={locked}
          onChange={(e) => onField({ a: e.target.value.replace(/\D/g, '').slice(0, 2) })}
          className="w-8 rounded-md border border-slate-300 bg-white py-1 text-center text-sm font-bold text-cro-navy outline-none focus:border-cro-red disabled:bg-slate-50"
        />
        <span className="text-slate-300">–</span>
        <input
          inputMode="numeric"
          value={state.b}
          disabled={locked}
          onChange={(e) => onField({ b: e.target.value.replace(/\D/g, '').slice(0, 2) })}
          className="w-8 rounded-md border border-slate-300 bg-white py-1 text-center text-sm font-bold text-cro-navy outline-none focus:border-cro-red disabled:bg-slate-50"
        />
        <span className="flex-1 truncate text-sm font-semibold text-cro-navy">{f.away.name}</span>
        <button onClick={onToggle} className="shrink-0 text-xs text-slate-400 hover:text-cro-red" title={locked ? "See everyone's picks" : 'More options'}>
          {expanded ? '▾' : locked ? '👀' : '⋯'}
        </button>
      </div>

      <div className="mt-1 flex items-center gap-2 pl-4 text-[11px] text-slate-400">
        <span>{kickoff}</span>
        {locked && <span className="rounded bg-slate-100 px-1 font-medium text-slate-500">Locked</span>}
        {isBanker && <span className="font-semibold text-amber-700">Banker 2×</span>}
        <span className="ml-auto flex items-center gap-2">
          {status?.error && <span className="text-red-600">{status.error}</span>}
          {saved && !status?.error && <span className="font-semibold text-emerald-600">Saved ✓</span>}
          {!locked && (
            <button
              onClick={onSave}
              disabled={status?.saving}
              className="rounded-md bg-cro-red px-3 py-1 text-xs font-bold text-white hover:bg-cro-red-dark disabled:opacity-50"
            >
              {status?.saving ? '…' : 'Save'}
            </button>
          )}
        </span>
      </div>

      {expanded && locked && (
        <div className="mt-2 rounded-lg bg-slate-50 p-2">
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">Everyone&apos;s picks</div>
          {reveal.length === 0 ? (
            <div className="text-xs text-slate-400">No predictions were made.</div>
          ) : (
            <ul className="grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
              {reveal.map((r, i) => (
                <li key={i} className="flex items-center gap-1.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] text-white" style={{ backgroundColor: r.color }}>
                    {r.crest}
                  </span>
                  <span className="truncate text-slate-600">{r.name}</span>
                  <span className="ml-auto font-bold tabular-nums text-cro-navy">
                    {r.a ?? '–'}-{r.b ?? '–'}
                    {r.banker && <span className="ml-0.5 text-amber-600">★</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {expanded && !locked && (
        <div className="mt-2 space-y-2 rounded-lg bg-slate-50 p-2">
          <div className="grid grid-cols-2 gap-2">
            <ScorerSelect value={state.s1} home={f.home} away={f.away} homePlayers={homePlayers} awayPlayers={awayPlayers} onChange={(v) => onField({ s1: v })} placeholder="Scorer 1" />
            <ScorerSelect value={state.s2} home={f.home} away={f.away} homePlayers={homePlayers} awayPlayers={awayPlayers} onChange={(v) => onField({ s2: v })} placeholder="Scorer 2" />
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <label className="flex items-center gap-1.5 text-slate-600">
              <input type="checkbox" checked={state.red} onChange={(e) => onField({ red: e.target.checked })} />
              Red card in match
            </label>
            <label className="flex items-center gap-1.5 font-semibold text-amber-700">
              <input type="checkbox" checked={isBanker} onChange={(e) => onBanker(e.target.checked)} />
              Banker (double points)
            </label>
          </div>
        </div>
      )}
    </li>
  )
}

function ScorerSelect({
  value,
  home,
  away,
  homePlayers,
  awayPlayers,
  onChange,
  placeholder,
}: {
  value: string
  home: { name: string }
  away: { name: string }
  homePlayers: PlayerLite[]
  awayPlayers: PlayerLite[]
  onChange: (v: string) => void
  placeholder: string
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 outline-none focus:border-cro-red"
    >
      <option value="">{placeholder} (optional)</option>
      <optgroup label={home.name}>
        {homePlayers.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </optgroup>
      <optgroup label={away.name}>
        {awayPlayers.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </optgroup>
    </select>
  )
}
