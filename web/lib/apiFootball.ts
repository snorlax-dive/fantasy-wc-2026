// Thin wrapper around API-Football (API-Sports v3).
// Default host is the direct API-Sports endpoint; set API_FOOTBALL_HOST to a
// RapidAPI host if you signed up through RapidAPI instead.

const HOST = process.env.API_FOOTBALL_HOST ?? 'https://v3.football.api-sports.io'
const KEY = process.env.API_FOOTBALL_KEY ?? ''

export const WORLD_CUP_LEAGUE = 1 // FIFA World Cup
export const SEASON = 2026

function authHeaders(): Record<string, string> {
  if (HOST.includes('rapidapi')) {
    return { 'x-rapidapi-key': KEY, 'x-rapidapi-host': new URL(HOST).host }
  }
  return { 'x-apisports-key': KEY }
}

// Returns the `response` array from API-Football, throwing on transport or API errors.
export async function apiFootball<T = unknown>(
  path: string,
  params: Record<string, string | number> = {}
): Promise<T[]> {
  if (!KEY) throw new Error('API_FOOTBALL_KEY is not set')

  const qs = new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)])
  ).toString()
  const url = `${HOST}${path}${qs ? `?${qs}` : ''}`

  const res = await fetch(url, { headers: authHeaders(), cache: 'no-store' })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`API-Football ${res.status} on ${path}: ${body.slice(0, 300)}`)
  }

  const json = (await res.json()) as { response?: T[]; errors?: unknown }
  const errs = json.errors
  const hasErrors = Array.isArray(errs)
    ? errs.length > 0
    : errs && typeof errs === 'object' && Object.keys(errs).length > 0
  if (hasErrors) {
    throw new Error(`API-Football errors on ${path}: ${JSON.stringify(errs)}`)
  }

  return (json.response ?? []) as T[]
}
