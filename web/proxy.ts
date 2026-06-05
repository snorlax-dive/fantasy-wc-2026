import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy-session'

// Next.js 16 renamed `middleware` -> `proxy` (Node.js runtime). Same mechanics.
export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    // Run on everything except API routes (they auth themselves), static assets, and images.
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
