'use client'

import { useEffect, useState } from 'react'

// Ticking countdown to an ISO timestamp. Renders "—" until mounted to avoid
// hydration mismatch, then "3d 4h 12m" / "Locked".
export function Countdown({ to }: { to: string }) {
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    const tick = () => setNow(Date.now())
    tick()
    const id = setInterval(tick, 1000)
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

// "4m ago" style relative time, refreshing every 30s (client-side).
export function RelativeTime({ iso }: { iso: string }) {
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    const tick = () => setNow(Date.now())
    tick()
    const id = setInterval(tick, 30000)
    return () => clearInterval(id)
  }, [])
  if (now === null) return <span>—</span>
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000))
  const txt =
    s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : `${Math.floor(s / 86400)}d ago`
  return <span>{txt}</span>
}

// Formats an ISO timestamp in the viewer's local timezone (client-side).
export function LocalTime({ iso }: { iso: string }) {
  const [s, setS] = useState<string | null>(null)
  useEffect(() => {
    const format = () => setS(
      new Date(iso).toLocaleString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    )
    format()
  }, [iso])
  return <span>{s ?? '—'}</span>
}
