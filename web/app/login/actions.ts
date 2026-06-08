'use server'

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
  try {
    const admin = createAdminClient()
    const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    isNew = !(data?.users ?? []).some((u) => (u.email ?? '').toLowerCase() === email)
  } catch {
    isNew = true // if the check fails, require the code (safe default)
  }
  if (isNew && invite !== process.env.INVITE_CODE) {
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
