'use client'

import { useActionState, useEffect, useState } from 'react'
import { saveProfile, type ProfileState } from './actions'
import { toast } from '@/components/toast'

const CRESTS = ['⚽', '🦁', '🐉', '🦅', '🐺', '⚡', '🔥', '👑', '🦈', '🐂', '💀', '🌟', '🐅', '🦊', '🏆', '🚀']
const COLORS = ['#e4002b', '#0e1c4e', '#1e5bb8', '#1f8c3b', '#f59e0b', '#7c3aed', '#db2777', '#0891b2']

export function ProfileForm({
  initial,
}: {
  initial: { display_name: string; team_name: string; crest: string; color: string; email_opt_out: boolean }
}) {
  const [state, action, pending] = useActionState<ProfileState, FormData>(saveProfile, {})
  const [crest, setCrest] = useState(initial.crest)
  const [color, setColor] = useState(initial.color)
  const [teamName, setTeamName] = useState(initial.team_name)
  const [emailOptIn, setEmailOptIn] = useState(!initial.email_opt_out)

  useEffect(() => {
    if (state.ok) toast('Club saved ✅')
    else if (state.error) toast(state.error, 'err')
  }, [state])

  return (
    <main className="mx-auto w-full max-w-md px-4 py-5 pb-24 sm:pb-10">
      <h1 className="text-xl font-extrabold text-cro-navy">Your club</h1>
      <p className="mt-1 text-sm text-slate-500">Name your team and pick a crest — this is how you show up on the leaderboard.</p>

      {/* Live preview */}
      <div className="mt-4 flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <span
          className="flex h-12 w-12 items-center justify-center rounded-xl text-2xl text-white shadow"
          style={{ backgroundColor: color }}
        >
          {crest}
        </span>
        <div>
          <div className="font-extrabold text-cro-navy">{teamName || 'Your Club FC'}</div>
          <div className="text-xs text-slate-400">{initial.display_name || 'manager'}</div>
        </div>
      </div>

      <form action={action} className="mt-4 space-y-5">
        <div>
          <label className="block text-sm font-semibold text-cro-navy">Club name</label>
          <input
            name="team_name"
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            maxLength={40}
            placeholder="e.g. Vatreni FC"
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-cro-red"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-cro-navy">Display name</label>
          <input
            name="display_name"
            defaultValue={initial.display_name}
            maxLength={40}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-cro-red"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-cro-navy">Crest</label>
          <input type="hidden" name="crest" value={crest} />
          <div className="mt-1 grid grid-cols-8 gap-1.5">
            {CRESTS.map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => setCrest(c)}
                className={`flex h-9 items-center justify-center rounded-lg text-lg ring-1 transition ${
                  crest === c ? 'bg-slate-100 ring-cro-red' : 'bg-white ring-slate-200 hover:bg-slate-50'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-cro-navy">Colour</label>
          <input type="hidden" name="color" value={color} />
          <div className="mt-1 flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => setColor(c)}
                style={{ backgroundColor: c }}
                className={`h-8 w-8 rounded-full ring-2 transition ${color === c ? 'ring-cro-navy' : 'ring-transparent'}`}
              />
            ))}
          </div>
        </div>

        <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              name="email_optin"
              checked={emailOptIn}
              onChange={(e) => setEmailOptIn(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-cro-red"
            />
            <span className="text-sm">
              <span className="font-semibold text-cro-navy">Email me reminders &amp; digests</span>
              <span className="block text-xs text-slate-400">Lock reminders before each round and the occasional standings update.</span>
            </span>
          </label>
        </div>

        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
        {state.ok && <p className="text-sm text-emerald-600">Saved! ✅</p>}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-xl bg-cro-red px-4 py-3 text-sm font-bold text-white transition hover:bg-cro-red-dark disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save club'}
        </button>
      </form>
    </main>
  )
}
