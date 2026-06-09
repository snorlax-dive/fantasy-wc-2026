import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { unsubToken, verifyUnsub } from '@/lib/notifyToken'

const USER_A = 'user-abc-123'
const USER_B = 'user-xyz-789'

describe('unsubToken', () => {
  it('returns a 32-character hex string', () => {
    const token = unsubToken(USER_A)
    expect(token).toHaveLength(32)
    expect(token).toMatch(/^[0-9a-f]{32}$/)
  })

  it('is deterministic for the same userId', () => {
    expect(unsubToken(USER_A)).toBe(unsubToken(USER_A))
  })

  it('different userIds produce different tokens', () => {
    expect(unsubToken(USER_A)).not.toBe(unsubToken(USER_B))
  })

  describe('with CRON_SECRET env var', () => {
    const originalSecret = process.env.CRON_SECRET

    beforeEach(() => {
      process.env.CRON_SECRET = 'test-secret-value'
    })
    afterEach(() => {
      if (originalSecret === undefined) delete process.env.CRON_SECRET
      else process.env.CRON_SECRET = originalSecret
    })

    it('uses CRON_SECRET when set', () => {
      const withSecret = unsubToken(USER_A)
      delete process.env.CRON_SECRET
      const withDefault = unsubToken(USER_A)
      expect(withSecret).not.toBe(withDefault)
    })

    it('falls back to dev-secret when CRON_SECRET is unset', () => {
      delete process.env.CRON_SECRET
      const token1 = unsubToken(USER_A)
      const token2 = unsubToken(USER_A)
      expect(token1).toBe(token2)
    })
  })
})

describe('verifyUnsub', () => {
  it('returns true for matching userId and token', () => {
    const token = unsubToken(USER_A)
    expect(verifyUnsub(USER_A, token)).toBe(true)
  })

  it('returns false for wrong token', () => {
    const token = unsubToken(USER_A)
    const wrongToken = token.slice(0, -1) + (token.slice(-1) === 'a' ? 'b' : 'a')
    expect(verifyUnsub(USER_A, wrongToken)).toBe(false)
  })

  it('returns false for wrong userId', () => {
    const token = unsubToken(USER_A)
    expect(verifyUnsub(USER_B, token)).toBe(false)
  })

  it('returns false for token of wrong length (short)', () => {
    expect(verifyUnsub(USER_A, 'short')).toBe(false)
  })

  it('returns false for token of wrong length (long)', () => {
    expect(verifyUnsub(USER_A, unsubToken(USER_A) + 'extra')).toBe(false)
  })

  it('returns false for empty token', () => {
    expect(verifyUnsub(USER_A, '')).toBe(false)
  })

  it('does not throw on mismatched buffer contents (timing-safe comparison)', () => {
    expect(() => verifyUnsub(USER_A, 'x'.repeat(32))).not.toThrow()
    expect(verifyUnsub(USER_A, 'x'.repeat(32))).toBe(false)
  })
})
