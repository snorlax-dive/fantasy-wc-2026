import { createClient } from '@supabase/supabase-js'

// Service-role client that BYPASSES Row Level Security.
// Use ONLY in trusted server code (seed scripts, cron/scoring route handlers).
// Never import this into a Client Component.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
