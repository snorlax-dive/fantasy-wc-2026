'use client'

import { useEffect, useState } from 'react'

// Ticking countdown to an ISO timestamp. Renders "—" until mounted to avoid
// hydration mismatch, then "3d 4h 12m" / "Locked".
export function Countdown({ to }: { to: string }) {
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  if (now === null) return <span>—</span>
  const ms = new Date(to).getTime() - now
  if (ms <= 0) return <span>Locked</span>

  const s = Math.floor(ms / 1000)
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const text = d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m ${sec}s` : `${m}m ${sec}s`
  return <span className="tabular-nums">{text}</span>
}

// Formats an ISO timestamp in the viewer's local timezone (client-side).
export function LocalTime({ iso }: { iso: string }) {
  const [s, setS] = useState<string | null>(null)
  useEffect(() => {
    setS(
      new Date(iso).toLocaleString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    )
  }, [iso])
  return <span>{s ?? '—'}</span>
}
