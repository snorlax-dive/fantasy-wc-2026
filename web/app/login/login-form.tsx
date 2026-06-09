'use client'

import { useActionState, useState } from 'react'
import { requestMagicLink, verifyCode, type LoginState } from './actions'

const init: LoginState = {}

export function LoginForm({ initialError }: { initialError?: string }) {
  const [reqState, reqAction, reqPending] = useActionState(requestMagicLink, init)
  const [verState, verAction, verPending] = useActionState(verifyCode, init)
  const [email, setEmail] = useState('')
  const [restart, setRestart] = useState(false)

  const sent = reqState.ok && !restart
  const errorMsg = (sent ? verState.error : reqState.error) ?? initialError

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
          {!sent ? (
            <>
              <p className="text-sm text-slate-500">
                Enter your email and the league invite code — we&apos;ll email you a sign-in code and a link.
              </p>
              <form action={reqAction} className="mt-6 space-y-4">
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
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-cro-red focus:ring-2 focus:ring-cro-red/20"
                    placeholder="you@example.com"
                  />
                </div>
                <div>
                  <label htmlFor="invite" className="block text-sm font-semibold text-cro-navy">
                    Invite code <span className="font-normal text-slate-400">— first time only</span>
                  </label>
                  <input
                    id="invite"
                    name="invite"
                    type="text"
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-cro-red focus:ring-2 focus:ring-cro-red/20"
                    placeholder="leave blank if returning"
                  />
                </div>

                {errorMsg && (
                  <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-600">{errorMsg}</p>
                )}

                <button
                  type="submit"
                  disabled={reqPending}
                  className="w-full rounded-lg bg-cro-red px-4 py-2.5 text-sm font-bold text-white transition hover:bg-cro-red-dark disabled:opacity-50"
                >
                  {reqPending ? 'Sending…' : 'Email me a sign-in code'}
                </button>
              </form>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-500">
                We emailed a 6-digit code{email ? <> to <span className="font-semibold text-cro-navy">{email}</span></> : ''}.
                Enter it below to sign in <span className="font-semibold">on this device</span> — handy if your email is on
                your phone but you&apos;re on a computer.
              </p>

              <form action={verAction} className="mt-6 space-y-4">
                <input type="hidden" name="email" value={email} />
                <div>
                  <label htmlFor="token" className="block text-sm font-semibold text-cro-navy">
                    6-digit code
                  </label>
                  <input
                    id="token"
                    name="token"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    required
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-center text-lg font-bold tracking-[0.4em] text-slate-900 outline-none focus:border-cro-red focus:ring-2 focus:ring-cro-red/20"
                    placeholder="••••••"
                  />
                </div>

                {errorMsg && (
                  <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-600">{errorMsg}</p>
                )}

                <button
                  type="submit"
                  disabled={verPending}
                  className="w-full rounded-lg bg-cro-red px-4 py-2.5 text-sm font-bold text-white transition hover:bg-cro-red-dark disabled:opacity-50"
                >
                  {verPending ? 'Verifying…' : 'Verify & sign in'}
                </button>
              </form>

              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
                On the same device that has your email? You can just tap the <span className="font-semibold">sign-in link</span> in
                the message instead.
              </div>

              <button
                onClick={() => setRestart(true)}
                className="mt-3 w-full text-center text-xs font-semibold text-slate-400 hover:text-cro-red"
              >
                Use a different email
              </button>
            </>
          )}
        </div>
      </div>
    </main>
  )
}
