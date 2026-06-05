// Pre-tournament strength prior (0.4–0.95), used ONLY to seed initial fantasy
// prices. The commissioner can override any price later. Unknown teams default
// to 0.55. Keys are lowercased team names as returned by API-Football.
const STRENGTH: Record<string, number> = {
  france: 0.95,
  brazil: 0.93,
  argentina: 0.93,
  england: 0.9,
  spain: 0.9,
  portugal: 0.88,
  netherlands: 0.86,
  germany: 0.86,
  belgium: 0.82,
  italy: 0.82,
  croatia: 0.78,
  uruguay: 0.78,
  colombia: 0.76,
  morocco: 0.76,
  usa: 0.72,
  'united states': 0.72,
  mexico: 0.72,
  switzerland: 0.72,
  denmark: 0.72,
  senegal: 0.72,
  japan: 0.7,
  'korea republic': 0.66,
  'south korea': 0.66,
  serbia: 0.66,
  nigeria: 0.66,
  ecuador: 0.64,
  canada: 0.62,
  poland: 0.62,
  'ivory coast': 0.62,
  egypt: 0.62,
  ghana: 0.6,
  cameroon: 0.6,
  iran: 0.6,
  australia: 0.6,
  'saudi arabia': 0.55,
  qatar: 0.5,
}

export function teamStrength(name: string | null | undefined): number {
  if (!name) return 0.55
  return STRENGTH[name.trim().toLowerCase()] ?? 0.55
}
