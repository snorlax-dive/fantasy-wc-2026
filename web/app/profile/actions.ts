'use server'

import { createClient } from '@/lib/supabase/server'

export type ProfileState = { ok?: boolean; error?: string }

export async function saveProfile(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'You are not signed in.' }

  const display = String(formData.get('display_name') ?? '').trim().slice(0, 40)
  const team = String(formData.get('team_name') ?? '').trim().slice(0, 40)
  const crest = String(formData.get('crest') ?? '').trim().slice(0, 8)
  const color = String(formData.get('color') ?? '').trim().slice(0, 9)

  // Checkbox "email me" → opted in when present; absent means opted out.
  const optIn = formData.get('email_optin') != null

  const patch: Record<string, string | boolean | null> = {
    team_name: team || null,
    crest: crest || null,
    color: color || null,
    email_opt_out: !optIn,
  }
  if (display) patch.display_name = display

  let { error } = await supabase.from('profiles').update(patch).eq('id', user.id)
  if (error && /email_opt_out/.test(error.message)) {
    // Migration 0004 not applied yet — save the rest so the form still works.
    delete patch.email_opt_out
    ;({ error } = await supabase.from('profiles').update(patch).eq('id', user.id))
  }
  if (error) return { error: error.message }
  return { ok: true }
}
