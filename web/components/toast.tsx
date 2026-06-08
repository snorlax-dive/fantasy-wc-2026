'use client'

import { useEffect, useState } from 'react'

type ToastItem = { id: number; msg: string; type: 'ok' | 'err' }
let seq = 0

// Fire a toast from anywhere (client): toast('Saved ✅') or toast('Oops', 'err')
export function toast(msg: string, type: 'ok' | 'err' = 'ok') {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('app-toast', { detail: { msg, type } }))
}

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([])
  useEffect(() => {
    function on(e: Event) {
      const d = (e as CustomEvent).detail as { msg: string; type: 'ok' | 'err' }
      const id = ++seq
      setItems((x) => [...x, { id, msg: d.msg, type: d.type ?? 'ok' }])
      setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 2800)
    }
    window.addEventListener('app-toast', on)
    return () => window.removeEventListener('app-toast', on)
  }, [])

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 sm:bottom-8">
      {items.map((i) => (
        <div
          key={i.id}
          className={`pointer-events-auto rounded-full px-4 py-2 text-sm font-semibold text-white shadow-lg ${
            i.type === 'ok' ? 'bg-emerald-600' : 'bg-red-600'
          }`}
        >
          {i.msg}
        </div>
      ))}
    </div>
  )
}
