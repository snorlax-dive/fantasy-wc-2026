import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyUnsub } from '@/lib/notifyToken'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function page(title: string, msg: string): Response {
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${title}</title></head>
    <body style="margin:0;background:#eef1f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
      <div style="max-width:440px;margin:48px auto;background:#fff;border-radius:16px;padding:28px;box-shadow:0 1px 3px rgba(0,0,0,.08);">
        <div style="height:6px;background:#e4002b;border-radius:6px;margin-bottom:18px;"></div>
        <h1 style="margin:0 0 10px;font-size:20px;color:#0e1c4e;">${title}</h1>
        <p style="font-size:15px;line-height:1.5;color:#334155;margin:0 0 16px;">${msg}</p>
        <a href="/profile" style="display:inline-block;background:#e4002b;color:#fff;text-decoration:none;font-weight:700;padding:10px 18px;border-radius:10px;font-size:14px;">Manage in app</a>
      </div>
    </body></html>`
  return new NextResponse(html, { headers: { 'content-type': 'text/html; charset=utf-8' } })
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const u = url.searchParams.get('u') ?? ''
  const t = url.searchParams.get('t') ?? ''
  if (!u || !t || !verifyUnsub(u, t)) {
    return page('Invalid link', 'This unsubscribe link is invalid or has expired. You can manage email preferences from your club page in the app.')
  }
  const db = createAdminClient()
  const { error } = await db.from('profiles').update({ email_opt_out: true }).eq('id', u)
  if (error) {
    return page('Something went wrong', 'We couldn’t update your preferences right now. Please try again from your club page in the app.')
  }
  return page('Unsubscribed ✓', 'You won’t get reminder or digest emails anymore. You can turn them back on any time from your club page in the app.')
}
