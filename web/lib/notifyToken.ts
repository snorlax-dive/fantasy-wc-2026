import { createHmac, timingSafeEqual } from 'crypto'

// One-click unsubscribe link signing. Uses CRON_SECRET so links work without a
// logged-in session (clicked straight from an email client).
export function unsubToken(userId: string): string {
  const secret = process.env.CRON_SECRET ?? 'dev-secret'
  return createHmac('sha256', secret).update(`unsub:${userId}`).digest('hex').slice(0, 32)
}

export function verifyUnsub(userId: string, token: string): boolean {
  const expected = unsubToken(userId)
  if (token.length !== expected.length) return false
  try {
    return timingSafeEqual(Buffer.from(token), Buffer.from(expected))
  } catch {
    return false
  }
}
