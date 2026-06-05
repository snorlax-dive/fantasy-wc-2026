/* eslint-disable @typescript-eslint/no-explicit-any */
// Supabase / PostgREST caps a single response at ~1000 rows. This pages through
// in chunks so queries that can exceed 1000 rows return EVERY row.
//
// Usage:
//   const rows = await fetchAll((from, to) =>
//     supabase.from('players').select('*').order('name').range(from, to)
//   )
export async function fetchAll<T = any>(
  makeQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>,
  chunk = 1000
): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += chunk) {
    const { data, error } = await makeQuery(from, from + chunk - 1)
    if (error) throw error
    const rows = data ?? []
    out.push(...rows)
    if (rows.length < chunk) break
  }
  return out
}
