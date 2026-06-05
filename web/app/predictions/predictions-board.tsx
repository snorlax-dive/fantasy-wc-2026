'use client'

import Link from 'next/link'
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

type CardState = { a: string; b: string; s1: string; s2: string; red: boolean }
type Status = { saving?: boolean; saved?: boolean; error?: string }

export function PredictionsBoard({
  fixtures,
  playersByTeam,
  existing,
}: {
  fixtures: FixtureRow[]
  playersByTeam: Record<number, PlayerLite[]>
  existing: ExistingPrediction[]
}) {
  const existingByFixture = useMemo(
    () => new Map(existing.map((e) => [e.fixture_id, e])),
    [existing]
  )

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
  const [bankerId, setBankerId] = useState<number | null>(
    existing.find((e) => e.is_banker)?.fixture_id ?? null
  )
  const [status, setStatus] = useState<Record<number, Status>>({})
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
  }

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
    })
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-3xl px-4 py-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Predictions</h1>
          <Link href="/" className="text-sm text-zinc-400 hover:text-zinc-200">
            ← Home
          </Link>
        </div>
        <p className="mt-1 text-sm text-zinc-400">
          Predict the score (required), up to 2 anytime scorers, and whether there&apos;ll be a red
          card. Pick one match as your <span className="text-amber-300">Banker</span> to double its
          points. Each match locks at kickoff.
        </p>

        {groups.map(([round, list]) => (
          <section key={round} className="mt-6">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{round}</h2>
            <div className="mt-2 space-y-3">
              {list.map((f) => (
                <FixtureCard
                  key={f.id}
                  f={f}
                  state={cards[f.id]}
                  status={status[f.id]}
                  isBanker={bankerId === f.id}
                  homePlayers={playersByTeam[f.home.id] ?? []}
                  awayPlayers={playersByTeam[f.away.id] ?? []}
                  onField={(patch) => setField(f.id, patch)}
                  onBanker={(checked) => setBankerId(checked ? f.id : bankerId === f.id ? null : bankerId)}
                  onSave={() => save(f)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  )
}

function FixtureCard({
  f,
  state,
  status,
  isBanker,
  homePlayers,
  awayPlayers,
  onField,
  onBanker,
  onSave,
}: {
  f: FixtureRow
  state: CardState
  status?: Status
  isBanker: boolean
  homePlayers: PlayerLite[]
  awayPlayers: PlayerLite[]
  onField: (patch: Partial<CardState>) => void
  onBanker: (checked: boolean) => void
  onSave: () => void
}) {
  const locked = new Date(f.lockTime) <= new Date()
  const kickoff = new Date(f.kickoff).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div className={`rounded-xl border p-3 ${isBanker ? 'border-amber-700 bg-amber-950/10' : 'border-zinc-800 bg-zinc-900/40'}`}>
      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span>{kickoff}</span>
        {locked && <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-400">Locked</span>}
      </div>

      <div className="mt-2 flex items-center gap-2">
        <span className="flex-1 text-right text-sm font-medium">{f.home.name}</span>
        <input
          inputMode="numeric"
          value={state.a}
          disabled={locked}
          onChange={(e) => onField({ a: e.target.value.replace(/\D/g, '').slice(0, 2) })}
          className="w-10 rounded-md border border-zinc-700 bg-zinc-950 py-1 text-center text-sm outline-none focus:border-emerald-500 disabled:opacity-50"
        />
        <span className="text-zinc-600">–</span>
        <input
          inputMode="numeric"
          value={state.b}
          disabled={locked}
          onChange={(e) => onField({ b: e.target.value.replace(/\D/g, '').slice(0, 2) })}
          className="w-10 rounded-md border border-zinc-700 bg-zinc-950 py-1 text-center text-sm outline-none focus:border-emerald-500 disabled:opacity-50"
        />
        <span className="flex-1 text-sm font-medium">{f.away.name}</span>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <ScorerSelect value={state.s1} disabled={locked} home={f.home} away={f.away} homePlayers={homePlayers} awayPlayers={awayPlayers} onChange={(v) => onField({ s1: v })} placeholder="Scorer 1" />
        <ScorerSelect value={state.s2} disabled={locked} home={f.home} away={f.away} homePlayers={homePlayers} awayPlayers={awayPlayers} onChange={(v) => onField({ s2: v })} placeholder="Scorer 2" />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-4 text-xs">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={state.red} disabled={locked} onChange={(e) => onField({ red: e.target.checked })} />
          Red card
        </label>
        <label className="flex items-center gap-1.5 text-amber-300">
          <input type="checkbox" checked={isBanker} disabled={locked} onChange={(e) => onBanker(e.target.checked)} />
          Banker (2×)
        </label>

        <div className="ml-auto flex items-center gap-2">
          {status?.error && <span className="text-red-400">{status.error}</span>}
          {status?.saved && <span className="text-emerald-400">Saved ✓</span>}
          {!locked && (
            <button
              onClick={onSave}
              disabled={status?.saving}
              className="rounded-md bg-emerald-600 px-3 py-1 font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {status?.saving ? '…' : 'Save'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function ScorerSelect({
  value,
  disabled,
  home,
  away,
  homePlayers,
  awayPlayers,
  onChange,
  placeholder,
}: {
  value: string
  disabled: boolean
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
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs outline-none focus:border-emerald-500 disabled:opacity-50"
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
