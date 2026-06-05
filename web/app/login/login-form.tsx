'use client'

import { useActionState } from 'react'
import { requestMagicLink, type LoginState } from './actions'

const init: LoginState = {}

export function LoginForm({ initialError }: { initialError?: string }) {
  const [state, action, pending] = useActionState(requestMagicLink, init)
  const errorMsg = state.error ?? initialError

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 p-6 text-zinc-100">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8 shadow-xl">
        <h1 className="text-2xl font-semibold tracking-tight">Fantasy World Cup 2026</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Enter your email and the league invite code — we&apos;ll email you a sign-in link.
        </p>

        {state.ok ? (
          <div className="mt-6 rounded-lg border border-emerald-800 bg-emerald-950/40 p-4 text-sm text-emerald-300">
            Check your inbox — a sign-in link is on its way. ✉️
          </div>
        ) : (
          <form action={action} className="mt-6 space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-zinc-300">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label htmlFor="invite" className="block text-sm font-medium text-zinc-300">
                Invite code
              </label>
              <input
                id="invite"
                name="invite"
                type="text"
                required
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                placeholder="league code"
              />
            </div>

            {errorMsg && (
              <p className="rounded-lg border border-red-900 bg-red-950/40 p-2 text-sm text-red-300">
                {errorMsg}
              </p>
            )}

            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
            >
              {pending ? 'Sending…' : 'Send magic link'}
            </button>
          </form>
        )}
      </div>
    </main>
  )
}
