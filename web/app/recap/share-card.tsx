'use client'

import { useState } from 'react'
import { toast } from '@/components/toast'

export function ShareCard() {
  const [busy, setBusy] = useState(false)

  async function share() {
    setBusy(true)
    try {
      const res = await fetch('/recap/card', { cache: 'no-store' })
      if (!res.ok) throw new Error('Could not build card')
      const blob = await res.blob()
      const file = new File([blob], 'fantasy-wc-recap.png', { type: 'image/png' })
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
      if (nav.canShare && nav.canShare({ files: [file] })) {
        await nav.share({ files: [file], title: 'My Fantasy WC round' })
      } else {
        // Fallback: open the image so the user can save / screenshot it
        window.open(URL.createObjectURL(blob), '_blank')
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') toast('Sharing not available — opening image', 'err')
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      onClick={share}
      disabled={busy}
      className="rounded-full bg-cro-red px-4 py-1.5 text-xs font-bold text-white transition hover:bg-cro-red-dark disabled:opacity-50"
    >
      {busy ? 'Preparing…' : '📤 Share'}
    </button>
  )
}
