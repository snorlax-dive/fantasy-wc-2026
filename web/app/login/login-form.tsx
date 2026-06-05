'use client'

import { useActionState } from 'react'
import { requestMagicLink, type LoginState } from './actions'

const init: LoginState = {}

export function LoginForm({ initialError }: { initialError?: string }) {
  const [state, action, pending] = useActionState(requestMagicLink, init)
  const errorMsg = state.error ?? initialError

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#eef1f5] p-6">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-slate-200">
        <div className="bg-cro-red px-7 py-6 text-white">
          <div className="flex items-center gap-2">
            <span className="checker-sm inline-block h-6 w-6 rounded-sm ring-1 ring-white/50" />
            <span className="text-sm font-bold uppercase tracking-widest text-white/80">Fantasy WC 2026</span>
          </div>
          <h1 className="mt-2 text-2xl font-extrabold">Sign in</h1>
        </div>
        <div className="checker h-1.5 w-full" />

        <div className="p-7">
          <p className="text-sm text-slate-500">
            Enter your email and the league invite code — we&apos;ll email you a sign-in link.
          </p>

          {state.ok ? (
            <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
              Check your inbox — a sign-in link is on its way. ✉️
            </div>
          ) : (
            <form action={action} className="mt-6 space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-semibold text-cro-navy">
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-cro-red focus:ring-2 focus:ring-cro-red/20"
                  placeholder="you@example.com"
                />
              </div>
              <div>
                <label htmlFor="invite" className="block text-sm font-semibold text-cro-navy">
                  Invite code
                </label>
                <input
                  id="invite"
                  name="invite"
                  type="text"
                  required
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-cro-red focus:ring-2 focus:ring-cro-red/20"
                  placeholder="league code"
                />
              </div>

              {errorMsg && (
                <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-600">{errorMsg}</p>
              )}

              <button
                type="submit"
                disabled={pending}
                className="w-full rounded-lg bg-cro-red px-4 py-2.5 text-sm font-bold text-white transition hover:bg-cro-red-dark disabled:opacity-50"
              >
                {pending ? 'Sending…' : 'Send magic link'}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  )
}
