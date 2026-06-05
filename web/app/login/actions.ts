'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type LoginState = { error?: string; sent?: boolean; email?: string }

// Step 1: validate invite code and email the user a 6-digit OTP code.
export async function sendCode(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase()
  const invite = String(formData.get('invite') ?? '').trim()

  if (!email.includes('@')) return { error: 'Enter a valid email address.' }
  if (invite !== process.env.INVITE_CODE) return { error: 'That invite code is not valid.' }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  })
  if (error) return { error: error.message }
  return { sent: true, email }
}

// Step 2: verify the 6-digit code and create the session.
export async function verifyCode(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase()
  const token = String(formData.get('code') ?? '').replace(/\D/g, '')

  if (token.length < 6) return { sent: true, email, error: 'Enter the 6-digit code from your email.' }

  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' })
  if (error) return { sent: true, email, error: error.message }

  redirect('/')
}
