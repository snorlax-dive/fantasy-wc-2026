import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { sendEmail, emailShell, emailConfigured, verifyEmail } from '@/lib/email'
import { unsubToken } from '@/lib/notifyToken'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/* eslint-disable @typescript-eslint/no-explicit-any */

async function authorized(req: Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') ?? ''
  if (secret && auth === `Bearer ${secret}`) return true
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return false
  const { data } = await supabase.from('profiles').select('is_commissioner').eq('id', user.id).maybeSingle()
  return data?.is_commissioner === true
}

const STAGE_LABEL: Record<string, string> = {
  GROUP: 'Group stage',
  R32: 'Round of 32',
  R16: 'Round of 16',
  QF: 'Quarter-finals',
  SF: 'Semi-finals',
  FINAL: 'Final',
}

// Reminders fire when the stage lock is within this window.
const REMINDER_WINDOW_MS = 6 * 60 * 60 * 1000

async function listEmails(db: any): Promise<Map<string, string>> {
  const byId = new Map<string, string>()
  let page = 1
  // listUsers is capped per page; page through to be safe (league is small but future-proof).
  for (;;) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 })
    if (error) break
    const users = data?.users ?? []
    for (const u of users) if (u.email) byId.set(u.id, u.email)
    if (users.length < 200) break
    page += 1
    if (page > 25) break
  }
  return byId
}

export async function GET(req: Request) {
  if (!(await authorized(req))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const url = new URL(req.url)
  const type = url.searchParams.get('type') ?? 'lock-reminder'
  const dry = url.searchParams.get('dry') === '1'
  const db = createAdminClient()
  const site = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || ''

  const supabase = await createClient()
  try {
    // Public tables (SELECT using(true)) use the server client; only squads + auth.admin need admin.
    const { data: settingsRows } = await supabase.from('settings').select('key, value')
    const settings = Object.fromEntries((settingsRows ?? []).map((r: any) => [r.key, r.value]))
    const stage = (settings['current_stage'] as string) ?? 'GROUP'
    const stageLabel = STAGE_LABEL[stage] ?? stage

    // Managers who opted out of email (column may not exist before migration 0004).
    let optedOut = new Set<string>()
    try {
      const { data: outs } = await supabase.from('profiles').select('id').eq('email_opt_out', true)
      optedOut = new Set((outs ?? []).map((r: any) => r.id))
    } catch {
      /* email_opt_out column not present yet — treat as nobody opted out */
    }

    // ---------------- diagnostics (no email sent) ----------------
    if (type === 'diag') {
      const v = await verifyEmail()
      return NextResponse.json({ ok: v.ok, type: 'diag', smtp: v })
    }

    if (!dry && type !== 'dry' && !emailConfigured()) {
      return NextResponse.json({ ok: false, note: 'SMTP not configured', type }, { status: 200 })
    }

    // ---------------- lock reminder (auto, idempotent per stage) ----------------
    if (type === 'lock-reminder') {
      const { data: firstFx } = await supabase
        .from('fixtures')
        .select('kickoff')
        .eq('stage', stage)
        .order('kickoff', { ascending: true })
        .limit(1)
        .maybeSingle()
      if (!firstFx?.kickoff) return NextResponse.json({ ok: true, sent: 0, note: 'no fixtures for stage', stage })

      const lockMs = new Date(firstFx.kickoff).getTime()
      const now = Date.now()
      if (lockMs <= now) return NextResponse.json({ ok: true, sent: 0, note: 'already locked', stage })
      if (lockMs - now > REMINDER_WINDOW_MS)
        return NextResponse.json({ ok: true, sent: 0, note: 'not within window', stage, minsToLock: Math.round((lockMs - now) / 60000) })

      const flagKey = `reminded_${stage}`
      // Fast path: flag already in settings snapshot.
      if (settings[flagKey] === true) return NextResponse.json({ ok: true, sent: 0, note: 'already reminded', stage })

      if (!dry) {
        // Atomically claim the reminder slot before sending any emails. Because settings.key
        // has a unique constraint, only one concurrent request can insert — the other gets a
        // 23505 unique-violation and bails out, preventing duplicate sends.
        const { error: claimErr } = await db.from('settings').insert({ key: flagKey, value: true })
        if (claimErr) {
          if (claimErr.code === '23505') {
            return NextResponse.json({ ok: true, sent: 0, note: 'already reminded (concurrent)', stage })
          }
          throw claimErr
        }
      }

      // Recipients = league members without a saved squad for this stage.
      const { data: squads } = await db.from('squads').select('user_id').eq('stage', stage)
      const submitted = new Set((squads ?? []).map((s: any) => s.user_id))
      const emails = await listEmails(db)
      const recipients = [...emails.entries()].filter(([id]) => !submitted.has(id) && !optedOut.has(id))

      if (dry)
        return NextResponse.json({ ok: true, type, stage, wouldSend: recipients.length, minsToLock: Math.round((lockMs - now) / 60000) })

      const lockLocal = new Date(firstFx.kickoff).toUTCString().replace('GMT', 'UTC')
      let sent = 0
      for (const [id, to] of recipients) {
        const unsubUrl = `${site}/api/unsubscribe?u=${id}&t=${unsubToken(id)}`
        const html = emailShell(
          `${stageLabel} locks soon`,
          `<tr><td style="padding-bottom:10px;">Heads up — the <b>${stageLabel}</b> deadline is almost here and you haven't set your squad yet.</td></tr>
           <tr><td style="padding-bottom:10px;">Once the first match kicks off (<b>${lockLocal}</b>) your squad, predictions and bracket lock for this round.</td></tr>`,
          'Set my squad',
          `${site}/squad`,
          unsubUrl
        )
        try {
          await sendEmail(to, `⏰ ${stageLabel} locks soon — set your squad`, html, unsubUrl)
          sent += 1
        } catch {
          /* skip individual failures */
        }
      }
      // Flag was already inserted before sending (atomic claim), no upsert needed here.
      return NextResponse.json({ ok: true, type, stage, sent, recipients: recipients.length })
    }

    // ---------------- digest (manual, commissioner-triggered) ----------------
    if (type === 'digest') {
      const { data: lb } = await supabase.rpc('get_leaderboard')
      const rows = (lb ?? []) as any[]
      const { data: profs } = await supabase.from('profiles').select('id, team_name')
      const teamById = new Map((profs ?? []).map((p: any) => [p.id, p.team_name as string | null]))

      const top = rows.slice(0, 10)
      const medal = (i: number) => (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`)
      const tableRows = top
        .map(
          (r, i) =>
            `<tr>
               <td style="padding:6px 8px;color:#94a3b8;width:32px;">${medal(i)}</td>
               <td style="padding:6px 8px;color:#0e1c4e;font-weight:600;">${teamById.get(r.user_id) || r.display_name}</td>
               <td style="padding:6px 8px;text-align:right;font-weight:800;color:#0e1c4e;">${r.total_points}</td>
             </tr>`
        )
        .join('')
      const body = `<tr><td style="padding-bottom:12px;">Here's where the league stands right now.</td></tr>
         <tr><td style="padding-bottom:12px;">
           <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;font-size:14px;">
             <tr style="background:#f8fafc;"><td style="padding:6px 8px;color:#94a3b8;">#</td><td style="padding:6px 8px;color:#94a3b8;">Manager</td><td style="padding:6px 8px;text-align:right;color:#94a3b8;">Pts</td></tr>
             ${tableRows || '<tr><td colspan="3" style="padding:12px;color:#94a3b8;">No scores yet.</td></tr>'}
           </table>
         </td></tr>`

      const emails = await listEmails(db)
      const recipients = [...emails.entries()].filter(([id]) => !optedOut.has(id))
      if (dry) return NextResponse.json({ ok: true, type, wouldSend: recipients.length, leaders: top.length })
      let sent = 0
      for (const [id, to] of recipients) {
        const unsubUrl = `${site}/api/unsubscribe?u=${id}&t=${unsubToken(id)}`
        const html = emailShell(`Standings update — ${stageLabel}`, body, 'View full leaderboard', `${site}/leaderboard`, unsubUrl)
        try {
          await sendEmail(to, `📊 Fantasy WC standings — ${stageLabel}`, html, unsubUrl)
          sent += 1
        } catch {
          /* skip */
        }
      }
      return NextResponse.json({ ok: true, type, sent, recipients: recipients.length })
    }

    return NextResponse.json({ error: 'unknown type', type }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'notify failed' }, { status: 500 })
  }
}
