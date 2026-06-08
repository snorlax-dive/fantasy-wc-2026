'use client'

import { useMemo, useState } from 'react'

type P = { id: number; name: string; pos: string; price: number; xpts: number; nation: string; owned: number; pts: number }
const POSITIONS = ['ALL', 'GK', 'DEF', 'MID', 'FWD']
const SORTS = [
  { key: 'pts', label: 'Points' },
  { key: 'xpts', label: 'Projected' },
  { key: 'price', label: 'Price' },
  { key: 'owned', label: 'Owned' },
] as const

const CAP = 250

export function PlayerExplorer({ players, nations, denom }: { players: P[]; nations: string[]; denom: number }) {
  const [q, setQ] = useState('')
  const [pos, setPos] = useState('ALL')
  const [nation, setNation] = useState('ALL')
  const [sort, setSort] = useState<(typeof SORTS)[number]['key']>('pts')

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    const out = players.filter(
      (p) =>
        (pos === 'ALL' || p.pos === pos) &&
        (nation === 'ALL' || p.nation === nation) &&
        (term === '' || p.name.toLowerCase().includes(term))
    )
    out.sort((a, b) =>
      sort === 'price'
        ? b.price - a.price
        : sort === 'owned'
          ? b.owned - a.owned
          : sort === 'xpts'
            ? b.xpts - a.xpts
            : b.pts - a.pts
    )
    return out
  }, [players, q, pos, nation, sort])

  const shown = filtered.slice(0, CAP)
  const pct = (n: number) => (denom > 0 ? Math.round((n / denom) * 100) : 0)

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-5 pb-24 sm:pb-10">
      <h1 className="text-xl font-extrabold text-cro-navy">Players</h1>
      <p className="mt-1 text-sm text-slate-500">
        Compare price, projected points (for the upcoming stage), ownership and realized points to plan your next squad.
      </p>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search player…"
        className="mt-4 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-cro-red"
      />
      <div className="mt-2 flex flex-wrap gap-2">
        {POSITIONS.map((p) => (
          <button
            key={p}
            onClick={() => setPos(p)}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold ring-1 ${pos === p ? 'bg-cro-red text-white ring-cro-red' : 'bg-white text-slate-600 ring-slate-200'}`}
          >
            {p}
          </button>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <select
          value={nation}
          onChange={(e) => setNation(e.target.value)}
          className="flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-cro-red"
        >
          <option value="ALL">All nations</option>
          {nations.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as any)}
          className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-cro-red"
        >
          {SORTS.map((s) => (
            <option key={s.key} value={s.key}>
              Sort: {s.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-3 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-3 py-2 text-left">Player</th>
              <th className="px-2 py-2 text-right">€</th>
              <th className="px-2 py-2 text-right">Proj.</th>
              <th className="px-2 py-2 text-right">Own</th>
              <th className="px-3 py-2 text-right">Pts</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {shown.map((p) => (
              <tr key={p.id}>
                <td className="px-3 py-2">
                  <div className="font-semibold text-cro-navy">{p.name}</div>
                  <div className="text-[11px] text-slate-400">
                    {p.pos} · {p.nation}
                  </div>
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-slate-600">{p.price.toFixed(1)}</td>
                <td className="px-2 py-2 text-right tabular-nums text-slate-400">{p.xpts.toFixed(1)}</td>
                <td className="px-2 py-2 text-right tabular-nums text-slate-500">
                  {denom > 0 ? `${pct(p.owned)}%` : '—'}
                </td>
                <td className="px-3 py-2 text-right font-extrabold tabular-nums text-cro-navy">{p.pts}</td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center text-sm text-slate-400">
                  No players match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-center text-[11px] text-slate-400">
        {filtered.length} players{filtered.length > CAP ? ` · showing top ${CAP}, refine your search` : ''}
      </p>
    </main>
  )
}
