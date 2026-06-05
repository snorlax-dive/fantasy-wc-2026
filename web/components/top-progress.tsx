'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

// Global navigation loading bar: appears the moment an internal link is clicked,
// disappears once the new route commits. Uses only usePathname (no useSearchParams,
// to avoid opting pages into client rendering).
export function TopProgress() {
  const pathname = usePathname()
  const [active, setActive] = useState(false)
  const prev = useRef(pathname)

  // Hide once the route actually changes.
  useEffect(() => {
    if (prev.current !== pathname) {
      prev.current = pathname
      setActive(false)
    }
  }, [pathname])

  // Show on any same-origin link click that changes the path.
  useEffect(() => {
    function start(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as HTMLElement | null)?.closest('a')
      if (!a) return
      const href = a.getAttribute('href') || ''
      if (!href || a.target === '_blank' || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return
      try {
        const url = new URL((a as HTMLAnchorElement).href)
        if (url.origin === window.location.origin && url.pathname !== window.location.pathname) setActive(true)
      } catch {
        /* ignore */
      }
    }
    document.addEventListener('click', start, true)
    return () => document.removeEventListener('click', start, true)
  }, [])

  // Safety: never get stuck.
  useEffect(() => {
    if (!active) return
    const t = setTimeout(() => setActive(false), 10000)
    return () => clearTimeout(t)
  }, [active])

  if (!active) return null
  return (
    <div className="fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden bg-cro-red/20">
      <div className="nprogress-bar h-full w-1/3 bg-cro-red" />
    </div>
  )
}
