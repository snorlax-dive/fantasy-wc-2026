import { vi } from 'vitest'

export type MockResponse = { data?: unknown; error?: { message: string } | null; count?: number | null; [key: string]: unknown }

// Builds a fluent Supabase query chain that resolves to `result`.
// Every method returns `chain` so chaining is always valid.
// The chain is also directly thenable for patterns like `await supabase.from(t).upsert(...)`.
export function makeChain(result: MockResponse = {}) {
  const final = { data: null, error: null, count: null, ...result }

  const chain: Record<string, unknown> = {}
  const self = () => chain

  for (const m of ['select', 'eq', 'neq', 'in', 'not', 'or', 'filter', 'match', 'order', 'limit', 'range', 'update', 'delete', 'insert', 'upsert', 'returns']) {
    chain[m] = vi.fn(self)
  }

  chain.maybeSingle = vi.fn(() => Promise.resolve(final))
  chain.single = vi.fn(() => Promise.resolve(final))
  // Make chain directly awaitable (e.g. `await supabase.from('t').upsert(...)`)
  chain.then = (onfulfilled: (v: typeof final) => unknown) => Promise.resolve(final).then(onfulfilled)

  return chain
}

export type MockSupabase = ReturnType<typeof createMockSupabase>

// Creates a mock Supabase client.
// `from` is a `vi.fn()` — use `.mockReturnValueOnce(makeChain(...))` to set per-call responses.
// By default every call returns `{ data: null, error: null }`.
export function createMockSupabase(user: { id: string; email?: string } | null = null) {
  const mockFrom = vi.fn(() => makeChain())

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
    },
    from: mockFrom,
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  }
}

// Convenience: user fixture used across action tests.
export const TEST_USER = { id: 'user-123', email: 'test@example.com' }
export const COMMISSIONER_USER = { id: 'commissioner-456', email: 'commissioner@example.com' }
