'use client'

import { useState, useTransition } from 'react'
import { saveBlock, setShield } from './actions'

export type Rival = {
  userId: string
  name: string
  players: { id: number; name: string; position: string }[]
}

export function BlocksBoard({
  stageLabel,
  stageOpen,
  locked,
  perTargetCap,
  shieldsLeft,
  rivals,
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
  myBlock: { targetUserId: string; playerId: number } | null
  usedShield: boolean
  revealed: { blocker: string; target: string; player: string }[]
}) {
  const [targetId, setTargetId] = useState<string>(myBlock?.targetUserId ?? '')
  const [playerId, setPlayerId] = useState<number | null>(myBlock?.playerId ?? null)
  const [shield, setShieldState] = useState<boolean>(usedShield)
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<{ ok?: boolean; error?: string } | null>(null)

  const target = rivals.find((r) => r.userId === targetId)

  function commit() {
    start(async () => {
      const res = await saveBlock({ targetUserId: targetId || null, playerId: targetId ? playerId : null })
      setMsg(res)
    })
  }
  function clearBlock() {
    setTargetId('')
    setPlayerId(null)
    start(async () => setMsg(await saveBlock({ targetUserId: null, playerId: null })))
  }
  function toggleShield(use: boolean) {
    setShieldState(use)
    start(async () => {
      const res = await setShield({ use })
      if (res.error) setShieldState(!use)
      setMsg(res)
    })
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-5 pb-24 sm:pb-10">
      <h1 className="text-xl font-extrabold text-cro-navy">Blocks &amp; shields</h1>
      <p className="text-xs font-semibold text-cro-red">{stageLabel}</p>

      {!stageOpen ? (
        <div className="mt-6 rounded-2xl bg-white p-6 text-center text-sm text-slate-500 shadow-sm ring-1 ring-slate-200">
          Blocks &amp; shields open in the <span className="font-semibold text-cro-navy">knockout rounds</span>.
          Once the commissioner starts the Round of 32, you&apos;ll be able to block a rival&apos;s player and
          spend shields here.
        </div>
      ) : locked ? (
        <>
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            This round is locked — blocks are revealed. 🔓
          </div>
          <h2 className="mt-5 text-sm font-bold text-cro-navy">Who blocked whom</h2>
          <ul className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
            {revealed.map((r, i) => (
              <li key={i} className="px-3 py-2 text-sm text-slate-600">
                <span className="font-semibold text-cro-navy">{r.blocker}</span> blocked{' '}
                <span className="font-semibold text-cro-red">{r.player}</span> on{' '}
                <span className="font-semibold text-cro-navy">{r.target}</span>
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
            Pick one rival&apos;s player to neutralise this round — they score 0 for that manager. Your
            choice is <span className="font-semibold text-cro-navy">secret until kickoff</span>. Up to{' '}
            {perTargetCap} blocks can land on one manager.
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

          {/* Block target */}
          <div className="mt-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-sm font-bold text-cro-navy">Your block</h2>
            <select
              value={targetId}
              onChange={(e) => {
                setTargetId(e.target.value)
                setPlayerId(null)
              }}
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-cro-red"
            >
              <option value="">— choose a rival —</option>
              {rivals.map((r) => (
                <option key={r.userId} value={r.userId}>
                  {r.name}
                </option>
              ))}
            </select>

            {target && (
              <ul className="mt-3 grid max-h-72 grid-cols-1 gap-1 overflow-auto sm:grid-cols-2">
                {target.players.map((p) => (
                  <li key={p.id}>
                    <button
                      onClick={() => setPlayerId(p.id)}
                      className={`flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-left text-sm ring-1 ${
                        playerId === p.id
                          ? 'bg-red-50 ring-cro-red'
                          : 'bg-white ring-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <span className="truncate text-cro-navy">{p.name}</span>
                      <span className="text-xs text-slate-400">{p.position}</span>
                    </button>
                  </li>
                ))}
              </ul>
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
