'use client'

import Link from 'next/link'
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
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-2xl px-4 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Blocks &amp; shields</h1>
            <p className="text-xs text-emerald-400">{stageLabel}</p>
          </div>
          <Link href="/" className="text-sm text-zinc-400 hover:text-zinc-200">
            ← Home
          </Link>
        </div>

        {!stageOpen ? (
          <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 text-center text-sm text-zinc-400">
            Blocks &amp; shields open in the <span className="text-zinc-200">knockout rounds</span>. Once the
            commissioner starts the Round of 32, you&apos;ll be able to block a rival&apos;s player and
            spend shields here.
          </div>
        ) : locked ? (
          <>
            <div className="mt-4 rounded-lg border border-amber-900 bg-amber-950/40 p-3 text-sm text-amber-300">
              This round is locked — blocks are revealed. 🔓
            </div>
            <h2 className="mt-5 text-sm font-semibold text-zinc-300">Who blocked whom</h2>
            <ul className="mt-2 divide-y divide-zinc-900 rounded-xl border border-zinc-800">
              {revealed.map((r, i) => (
                <li key={i} className="px-3 py-2 text-sm">
                  <span className="font-medium">{r.blocker}</span>
                  <span className="text-zinc-500"> blocked </span>
                  <span className="text-red-300">{r.player}</span>
                  <span className="text-zinc-500"> on </span>
                  <span className="font-medium">{r.target}</span>
                </li>
              ))}
              {revealed.length === 0 && (
                <li className="px-3 py-6 text-center text-sm text-zinc-500">No blocks this round.</li>
              )}
            </ul>
          </>
        ) : (
          <>
            <p className="mt-1 text-sm text-zinc-400">
              Pick one rival&apos;s player to neutralise this round — they score 0 for that manager.
              Your choice is <span className="text-zinc-200">secret until kickoff</span>. Up to{' '}
              {perTargetCap} blocks can land on one manager.
            </p>

            {/* Shield */}
            <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold">Shield</h2>
                  <p className="text-xs text-zinc-500">
                    Protects you from all blocks this round. {shieldsLeft} left for the tournament.
                  </p>
                </div>
                <label className="flex items-center gap-2 text-sm">
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
            <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <h2 className="text-sm font-semibold">Your block</h2>
              <select
                value={targetId}
                onChange={(e) => {
                  setTargetId(e.target.value)
                  setPlayerId(null)
                }}
                className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-emerald-500"
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
                        className={`flex w-full items-center justify-between rounded-lg border px-3 py-1.5 text-left text-sm ${
                          playerId === p.id
                            ? 'border-red-600 bg-red-950/30'
                            : 'border-zinc-800 hover:bg-zinc-800'
                        }`}
                      >
                        <span className="truncate">{p.name}</span>
                        <span className="text-xs text-zinc-500">{p.position}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {msg?.error && <p className="mt-3 text-sm text-red-400">{msg.error}</p>}
              {msg?.ok && <p className="mt-3 text-sm text-emerald-400">Saved ✓</p>}

              <div className="mt-3 flex gap-2">
                <button
                  onClick={commit}
                  disabled={pending || !targetId || !playerId}
                  className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-40"
                >
                  {pending ? 'Saving…' : 'Commit block'}
                </button>
                {myBlock && (
                  <button
                    onClick={clearBlock}
                    disabled={pending}
                    className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  )
}
