'use server'

import { createClient } from '@/lib/supabase/server'

export type LoginState = { error?: string; ok?: boolean }

// Sends a magic sign-in link to the user's email (after checking the invite code).
export async function requestMagicLink(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase()
  const invite = String(formData.get('invite') ?? '').trim()

  if (!email.includes('@')) return { error: 'Enter a valid email address.' }
  if (invite !== process.env.INVITE_CODE) return { error: 'That invite code is not valid.' }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  if (!siteUrl) return { error: 'Server misconfig: NEXT_PUBLIC_SITE_URL is not set.' }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${siteUrl}/auth/callback` },
  })

  if (error) return { error: error.message }
  return { ok: true }
}
