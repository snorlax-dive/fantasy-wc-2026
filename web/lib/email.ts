import nodemailer from 'nodemailer'

type Transport = ReturnType<typeof nodemailer.createTransport>

let cached: Transport | null = null

export function emailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
}

function getTransport(): Transport | null {
  if (cached) return cached
  const host = process.env.SMTP_HOST
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  if (!host || !user || !pass) return null
  const port = Number(process.env.SMTP_PORT ?? 587)
  cached = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  })
  return cached
}

/** Tells you which SMTP vars are present (never their values) + live connection result. */
export async function verifyEmail(): Promise<{
  ok: boolean
  present: { host: boolean; port: boolean; user: boolean; pass: boolean; from: boolean }
  error?: string
}> {
  const present = {
    host: Boolean(process.env.SMTP_HOST),
    port: Boolean(process.env.SMTP_PORT),
    user: Boolean(process.env.SMTP_USER),
    pass: Boolean(process.env.SMTP_PASS),
    from: Boolean(process.env.SMTP_FROM),
  }
  const t = getTransport()
  if (!t) return { ok: false, present, error: 'SMTP not configured (need HOST, USER, PASS)' }
  try {
    await t.verify()
    return { ok: true, present }
  } catch (e) {
    return { ok: false, present, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  unsubscribeUrl?: string
): Promise<void> {
  const t = getTransport()
  if (!t) throw new Error('SMTP not configured')
  const from = process.env.SMTP_FROM || process.env.SMTP_USER
  if (!from) throw new Error('SMTP_FROM (or SMTP_USER as fallback) is not configured')
  const headers = unsubscribeUrl
    ? { 'List-Unsubscribe': `<${unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
    : undefined
  await t.sendMail({ from, to, subject, html, headers })
}

function escHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

/** Minimal, brand-consistent email shell. No jokes — plain and clear. */
export function emailShell(
  title: string,
  bodyHtml: string,
  ctaLabel?: string,
  ctaUrl?: string,
  unsubscribeUrl?: string
): string {
  const cta =
    ctaLabel && ctaUrl
      ? `<tr><td style="padding:8px 0 4px;">
           <a href="${ctaUrl}" style="display:inline-block;background:#e4002b;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px;font-size:15px;">${ctaLabel}</a>
         </td></tr>`
      : ''
  const unsub = unsubscribeUrl
    ? ` · <a href="${unsubscribeUrl}" style="color:#94a3b8;text-decoration:underline;">Unsubscribe</a>`
    : ''
  return `<!doctype html><html><body style="margin:0;background:#eef1f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f5;padding:24px 0;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);">
          <tr><td style="background:#e4002b;padding:16px 24px;">
            <span style="color:#ffffff;font-weight:800;font-size:18px;letter-spacing:.3px;">Fantasy World Cup 2026</span>
          </td></tr>
          <tr><td style="padding:24px;">
            <h1 style="margin:0 0 12px;font-size:20px;color:#0e1c4e;">${escHtml(title)}</h1>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:15px;line-height:1.5;color:#334155;">
              ${bodyHtml}
              ${cta}
            </table>
          </td></tr>
          <tr><td style="padding:14px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;">
            <span style="font-size:12px;color:#94a3b8;">You're receiving this because you're in the Fantasy World Cup 2026 league.${unsub}</span>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body></html>`
}
