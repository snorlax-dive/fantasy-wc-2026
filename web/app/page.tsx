import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function Home() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // `profiles` may not exist yet on a fresh project (before the migration is run) —
  // fall back to the email so the first deploy still renders.
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, is_commissioner')
    .eq('id', user.id)
    .maybeSingle()

  const name = profile?.display_name ?? user.email

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-zinc-950 p-6 text-zinc-100">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8 text-center shadow-xl">
        <p className="text-sm uppercase tracking-widest text-emerald-400">Fantasy World Cup 2026</p>
        <h1 className="mt-2 text-2xl font-semibold">Welcome, {name} ⚽</h1>
        <p className="mt-2 text-sm text-zinc-400">
          You&apos;re signed in. The leaderboard lands next.
        </p>
        {profile?.is_commissioner && (
          <p className="mt-3 inline-block rounded-full bg-amber-950/50 px-3 py-1 text-xs text-amber-300">
            Commissioner
          </p>
        )}

        <div className="mt-6 grid gap-2">
          <a
            href="/squad"
            className="block rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500"
          >
            Build your squad →
          </a>
          <a
            href="/predictions"
            className="block rounded-lg border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:bg-zinc-800"
          >
            Make predictions →
          </a>
          <a
            href="/bracket"
            className="block rounded-lg border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:bg-zinc-800"
          >
            Fill your bracket →
          </a>
          <a
            href="/blocks"
            className="block rounded-lg border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:bg-zinc-800"
          >
            Blocks &amp; shields →
          </a>
          <a
            href="/leaderboard"
            className="block rounded-lg border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:bg-zinc-800"
          >
            Leaderboard →
          </a>
        </div>

        <form action="/auth/signout" method="post" className="mt-4">
          <button
            type="submit"
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 transition hover:bg-zinc-800"
          >
            Sign out
          </button>
        </form>
      </div>
    </main>
  )
}
