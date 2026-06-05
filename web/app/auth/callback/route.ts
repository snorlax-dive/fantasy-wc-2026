import { NextResponse } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

// Handles the magic-link return. Surfaces the REAL reason on failure so we can
// diagnose instead of a generic error. Supports both the PKCE (?code=) and the
// token_hash (?token_hash=&type=) link formats.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const next = searchParams.get('next') ?? '/'
  const sbError = searchParams.get('error_description') || searchParams.get('error')

  const fail = (reason: string) => {
    console.error('[auth/callback] FAIL:', reason, '| url:', request.url)
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(reason)}`)
  }

  // Supabase appended an error to the redirect (e.g. expired/used link).
  if (sbError) return fail(sbError)

  const supabase = await createClient()

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) return fail(`exchange failed: ${error.message}`)
    return NextResponse.redirect(`${origin}${next}`)
  }

  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash })
    if (error) return fail(`verify failed: ${error.message}`)
    return NextResponse.redirect(`${origin}${next}`)
  }

  // Neither param present — the link didn't carry a code/token_hash to the server.
  return fail('link had no code or token_hash (check Supabase Redirect URLs / email template)')
}
