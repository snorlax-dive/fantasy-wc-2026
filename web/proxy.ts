import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy-session'

// Next.js 16 renamed `middleware` -> `proxy` (Node.js runtime). Same mechanics.
export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    // Run on everything except static assets and image files.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
