'use client'

import { useMemo, useState, useTransition } from 'react'
import { saveBlock, setShield } from './actions'
import { toast } from '@/components/toast'

export type Rival = { userId: string; name: string }
export type PoolPlayer = { id: number; name: string; position: string; team: string }
export type Revealed = { blocker: string; target: string; player: string; hit: boolean }

export function BlocksBoard({
  stageLabel,
  stageOpen,
  locked,
  perTargetCap,
  shieldsLeft,
  rivals,
  players,
  myBlock,
  usedShield,
  revealed,
}: {
  stageLabel: string
  stageOpen: boolean
  locked: boolean
  perTargetCap: number
  shieldsLeft: number
  rivals: Rival[]
  players: PoolPlayer[]
  myBlock: { targetUserId: string; playerId: number } | null
  usedShield: boolean
  revealed: Revealed[]
}) {
  const [targetId, setTargetId] = useState<string>(myBlock?.targetUserId ?? '')
  const [playerId, setPlayerId] = useState<number | null>(myBlock?.playerId ?? null)
  const [q, setQ] = useState('')
  const [shield, setShieldState] = useState<boolean>(usedShield)
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<{ ok?: boolean; error?: string } | null>(null)

  const playerById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players])
  const chosen = playerId != null ? playerById.get(playerId) : null
  const results = useMemo(() => {
    if (q.length < 2) return []
    const s = q.toLowerCase()
    return players.filter((p) => p.name.toLowerCase().includes(s) || p.team.toLowerCase().includes(s)).slice(0, 12)
  }, [players, q])

  function commit() {
    start(async () => {
      const res = await saveBlock({ targetUserId: targetId || null, playerId: targetId ? playerId : null })
      setMsg(res)
      toast(res.ok ? 'Block committed 🛡️' : res.error ?? 'Could not save', res.ok ? 'ok' : 'err')
    })
  }
  function clearBlock() {
    setTargetId('')
    setPlayerId(null)
    start(async () => {
      const res = await saveBlock({ targetUserId: null, playerId: null })
      setMsg(res)
      toast('Block cleared')
    })
  }
  function toggleShield(use: boolean) {
    setShieldState(use)
    start(async () => {
      const res = await setShield({ use })
      if (res.error) setShieldState(!use)
      setMsg(res)
      toast(res.ok ? (use ? 'Shield up 🛡️' : 'Shield removed') : res.error ?? 'Error', res.ok ? 'ok' : 'err')
    })
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-5 pb-24 sm:pb-10">
      <h1 className="text-xl font-extrabold text-cro-navy">Blocks &amp; shields</h1>
      <p className="text-xs font-semibold text-cro-red">{stageLabel}</p>

      {!stageOpen ? (
        <div className="mt-6 rounded-2xl bg-white p-6 text-center text-sm text-slate-500 shadow-sm ring-1 ring-slate-200">
          Blocks &amp; shields open in the <span className="font-semibold text-cro-navy">knockout rounds</span>.
        </div>
      ) : locked ? (
        <>
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            This round is locked — blocks are revealed. 🔓
          </div>
          <h2 className="mt-5 text-sm font-bold text-cro-navy">Who blocked whom</h2>
          <ul className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
            {revealed.map((r, i) => (
              <li key={i} className="flex items-center gap-2 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate text-slate-600">
                  <span className="font-semibold text-cro-navy">{r.blocker}</span> blocked{' '}
                  <span className="text-cro-red">{r.player}</span> on{' '}
                  <span className="font-semibold text-cro-navy">{r.target}</span>
                </span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                    r.hit ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {r.hit ? 'HIT' : 'missed'}
                </span>
              </li>
            ))}
            {revealed.length === 0 && (
              <li className="px-3 py-6 text-center text-sm text-slate-400">No blocks this round.</li>
            )}
          </ul>
        </>
      ) : (
        <>
          <p className="mt-1 text-sm text-slate-500">
            Pick a rival and the player you think they&apos;ll field — if you&apos;re right, that player scores
            0 for them this round. You <span className="font-semibold text-cro-navy">can&apos;t see their squad</span>,
            and your block stays secret until kickoff. Up to {perTargetCap} blocks can land on one manager.
          </p>

          {/* Shield */}
          <div className="mt-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-cro-navy">🛡️ Shield</h2>
                <p className="text-xs text-slate-500">
                  Protects you from all blocks this round. {shieldsLeft} left for the tournament.
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={shield}
                  disabled={pending || (!shield && shieldsLeft <= 0)}
                  onChange={(e) => toggleShield(e.target.checked)}
                />
                Use a shield
              </label>
            </div>
          </div>

          {/* Block */}
          <div className="mt-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-sm font-bold text-cro-navy">Your block</h2>
            <select
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-cro-red"
            >
              <option value="">— choose a rival —</option>
              {rivals.map((r) => (
                <option key={r.userId} value={r.userId}>
                  {r.name}
                </option>
              ))}
            </select>

            {targetId && (
              <div className="mt-3">
                {chosen ? (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="rounded-full bg-red-50 px-3 py-1 font-semibold text-cro-red ring-1 ring-red-200">
                      {chosen.name} · {chosen.team}
                    </span>
                    <button onClick={() => setPlayerId(null)} className="text-xs text-slate-400 hover:text-red-600">
                      change
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder="Search the player you think they picked…"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-cro-red"
                    />
                    {results.length > 0 && (
                      <ul className="mt-1 divide-y divide-slate-100 overflow-hidden rounded-lg ring-1 ring-slate-200">
                        {results.map((p) => (
                          <li key={p.id}>
                            <button
                              onClick={() => {
                                setPlayerId(p.id)
                                setQ('')
                              }}
                              className="flex w-full items-center justify-between bg-white px-3 py-1.5 text-left text-sm hover:bg-slate-50"
                            >
                              <span className="truncate text-cro-navy">{p.name}</span>
                              <span className="text-xs text-slate-400">
                                {p.position} · {p.team}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </div>
            )}

            {msg?.error && <p className="mt-3 text-sm text-red-600">{msg.error}</p>}
            {msg?.ok && <p className="mt-3 text-sm text-emerald-600">Saved ✓</p>}

            <div className="mt-3 flex gap-2">
              <button
                onClick={commit}
                disabled={pending || !targetId || !playerId}
                className="flex-1 rounded-lg bg-cro-red px-4 py-2 text-sm font-bold text-white hover:bg-cro-red-dark disabled:opacity-40"
              >
                {pending ? 'Saving…' : 'Commit block'}
              </button>
              {myBlock && (
                <button
                  onClick={clearBlock}
                  disabled={pending}
                  className="rounded-lg px-4 py-2 text-sm text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </main>
  )
}
