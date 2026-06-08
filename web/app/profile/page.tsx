import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ProfileForm } from './profile-form'

export const dynamic = 'force-dynamic'

export default async function ProfilePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: p } = await supabase
    .from('profiles')
    .select('display_name, team_name, crest, color, email_opt_out')
    .eq('id', user.id)
    .maybeSingle()

  return (
    <ProfileForm
      initial={{
        display_name: p?.display_name ?? '',
        team_name: p?.team_name ?? '',
        crest: p?.crest ?? '⚽',
        color: p?.color ?? '#e4002b',
        email_opt_out: Boolean((p as { email_opt_out?: boolean } | null)?.email_opt_out),
      }}
    />
  )
}
