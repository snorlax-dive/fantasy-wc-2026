'use server'

import { timingSafeEqual } from 'crypto'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type LoginState = { error?: string; ok?: boolean }

export async function requestMagicLink(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase()
  const invite = String(formData.get('invite') ?? '').trim()

  if (!email.includes('@')) return { error: 'Enter a valid email address.' }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  if (!siteUrl) return { error: 'Server misconfig: NEXT_PUBLIC_SITE_URL is not set.' }

  // Returning players don't need the invite code — only first-timers do.
  let isNew = true
  let signupsOpen = true
  try {
    const admin = createAdminClient()
    const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    isNew = !(data?.users ?? []).some((u) => (u.email ?? '').toLowerCase() === email)
    const { data: su } = await admin.from('settings').select('value').eq('key', 'signups_open').maybeSingle()
    signupsOpen = su?.value !== false // default open if unset
  } catch {
    isNew = true // if the check fails, require the code (safe default)
  }
  if (isNew && !signupsOpen) {
    return { error: 'Sign-ups are closed for this league.' }
  }
  const expected = process.env.INVITE_CODE ?? ''
  const inviteBuf = Buffer.from(invite)
  const expectedBuf = Buffer.from(expected)
  const inviteValid =
    inviteBuf.length === expectedBuf.length && timingSafeEqual(inviteBuf, expectedBuf)
  if (isNew && !inviteValid) {
    return { error: 'First time here? Enter the league invite code to join.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${siteUrl}/auth/callback`, shouldCreateUser: true },
  })
  if (error) return { error: error.message }
  return { ok: true }
}

// Cross-device sign-in: verify the 6-digit code from the email. Unlike the magic
// link (which only works in the browser that requested it, due to the PKCE
// code_verifier cookie), the code can be read on any device and typed into the
// one you want to sign in — read it on your phone, type it on your laptop.
export async function verifyCode(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const token = String(formData.get('token') ?? '').replace(/\D/g, '')

  if (!email.includes('@')) return { error: 'Missing email — go back and request a new code.' }
  if (token.length !== 6) return { error: 'Enter the 6-digit code from your email.' }

  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' })
  if (error) {
    return { error: /expired|invalid/i.test(error.message) ? 'That code is wrong or expired — request a new one.' : error.message }
  }
  // Session cookies are now set; land on the home page.
  redirect('/')
}
