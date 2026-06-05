'use client'

import { useActionState } from 'react'
import { sendCode, verifyCode, type LoginState } from './actions'

const init: LoginState = {}

export default function LoginPage() {
  const [sendState, sendAction, sending] = useActionState(sendCode, init)
  const [verifyState, verifyAction, verifying] = useActionState(verifyCode, init)

  const sent = sendState.sent === true
  const email = sendState.email ?? ''

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 p-6 text-zinc-100">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8 shadow-xl">
        <h1 className="text-2xl font-semibold tracking-tight">Fantasy World Cup 2026</h1>

        {!sent ? (
          <>
            <p className="mt-1 text-sm text-zinc-400">
              Enter your email and the league invite code — we&apos;ll email you a 6-digit sign-in code.
            </p>
            <form action={sendAction} className="mt-6 space-y-4">
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
              {sendState.error && <p className="text-sm text-red-400">{sendState.error}</p>}
              <button
                type="submit"
                disabled={sending}
                className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
              >
                {sending ? 'Sending…' : 'Send my code'}
              </button>
            </form>
          </>
        ) : (
          <>
            <p className="mt-1 text-sm text-zinc-400">
              We emailed a 6-digit code to <span className="text-zinc-200">{email}</span>. Enter it below.
            </p>
            <form action={verifyAction} className="mt-6 space-y-4">
              <input type="hidden" name="email" value={email} />
              <div>
                <label htmlFor="code" className="block text-sm font-medium text-zinc-300">
                  6-digit code
                </label>
                <input
                  id="code"
                  name="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  required
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-center text-lg tracking-[0.4em] outline-none focus:border-emerald-500"
                  placeholder="••••••"
                />
              </div>
              {verifyState.error && <p className="text-sm text-red-400">{verifyState.error}</p>}
              <button
                type="submit"
                disabled={verifying}
                className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
              >
                {verifying ? 'Verifying…' : 'Verify & sign in'}
              </button>
              <p className="text-xs text-zinc-500">
                Didn&apos;t get it? Check spam, or reload the page to request a new code.
              </p>
            </form>
          </>
        )}
      </div>
    </main>
  )
}
