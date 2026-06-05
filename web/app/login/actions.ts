'use server'

import { createClient } from '@/lib/supabase/server'

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
  if (invite !== process.env.INVITE_CODE) return { error: 'That invite code is not valid.' }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
    },
  })

  if (error) return { error: error.message }
  return { ok: true }
}
