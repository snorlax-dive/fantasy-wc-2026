'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { TopProgress } from './top-progress'
import { Toaster } from './toast'

const NAV = [
  { href: '/squad', label: 'Squad', icon: '⚽' },
  { href: '/predictions', label: 'Predict', icon: '🎯' },
  { href: '/bracket', label: 'Bracket', icon: '🗺️' },
  { href: '/leaderboard', label: 'Table', icon: '🏆' },
  { href: '/blocks', label: 'Blocks', icon: '🛡️' },
]

function isActive(path: string, href: string) {
  return path === href || path.startsWith(href + '/')
}

export function AppChrome({ children }: { children: React.ReactNode }) {
  const path = usePathname()
  if (path.startsWith('/login') || path.startsWith('/auth')) return <>{children}</>

  return (
    <>
      <TopProgress />
      <Toaster />
      <header className="sticky top-0 z-30 bg-cro-red text-white shadow-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2 text-lg font-extrabold tracking-tight">
            <span className="checker-sm inline-block h-5 w-5 rounded-sm ring-1 ring-white/50" />
            Fantasy WC <span className="font-semibold text-white/70">26</span>
          </Link>
          <nav className="hidden items-center gap-1 sm:flex">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
                  isActive(path, n.href) ? 'bg-white text-cro-red' : 'text-white/90 hover:bg-white/15'
                }`}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <form action="/auth/signout" method="post">
            <button className="rounded-md px-2 py-1 text-sm font-medium text-white/85 hover:bg-white/15">
              Sign out
            </button>
          </form>
        </div>
        <div className="checker h-1.5 w-full" />
      </header>

      {children}

      {/* Mobile bottom nav (FPL-style) */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur sm:hidden">
        <div className="mx-auto grid max-w-3xl grid-cols-5">
          {NAV.map((n) => {
            const active = isActive(path, n.href)
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold transition ${
                  active ? 'text-cro-red' : 'text-slate-500'
                }`}
              >
                <span className="text-lg leading-none">{n.icon}</span>
                {n.label}
              </Link>
            )
          })}
        </div>
      </nav>
    </>
  )
}
