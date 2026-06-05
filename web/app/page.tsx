import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const TILES = [
  { href: '/squad', title: 'Squad', desc: 'Build your XI', emoji: '⚽' },
  { href: '/predictions', title: 'Predictions', desc: 'Scores · scorers · cards', emoji: '🎯' },
  { href: '/bracket', title: 'Bracket', desc: 'Knockout tree + awards', emoji: '🗺️' },
  { href: '/leaderboard', title: 'Leaderboard', desc: 'Who’s on top', emoji: '🏆' },
  { href: '/blocks', title: 'Blocks & shields', desc: 'Sabotage your rivals', emoji: '🛡️' },
]

export default async function Home() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, is_commissioner')
    .eq('id', user.id)
    .maybeSingle()
  const name = profile?.display_name ?? user.email

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-5 pb-24 sm:pb-10">
      <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        <div className="p-5">
          <p className="text-xs font-bold uppercase tracking-widest text-cro-red">Fantasy World Cup 2026</p>
          <h1 className="mt-1 text-2xl font-extrabold text-cro-navy">Welcome, {name} ⚽</h1>
          <p className="mt-1 text-sm text-slate-500">
            Lock your squad, predictions, and bracket before the first kickoff.
          </p>
          {profile?.is_commissioner && (
            <Link
              href="/admin"
              className="mt-3 inline-block rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800 ring-1 ring-amber-200"
            >
              Commissioner panel →
            </Link>
          )}
        </div>
        <div className="checker h-1.5 w-full" />
      </section>

      <div className="mt-4 grid grid-cols-2 gap-3">
        {TILES.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:ring-cro-red"
          >
            <div className="text-2xl">{t.emoji}</div>
            <div className="mt-2 font-extrabold text-cro-navy">{t.title}</div>
            <div className="text-xs text-slate-500">{t.desc}</div>
          </Link>
        ))}
      </div>
    </main>
  )
}
