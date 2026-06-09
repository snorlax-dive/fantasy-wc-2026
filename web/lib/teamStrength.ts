// Pre-tournament strength priors (0.4–0.95), used to seed initial fantasy
// prices/projections and as the prior for in-tournament re-pricing. The
// commissioner can override any price later. Unknown teams default to 0.55
// on both axes. Keys are lowercased team names as returned by API-Football —
// a few entries carry alternate spellings since the API isn't always
// consistent (e.g. "USA" vs "United States", "Korea Republic" vs "South Korea").
//
// Two independent axes because the scoring rules reward them independently:
// `attack` drives expected goals (FWD/MID points), `defense` drives expected
// clean sheets (GK/DEF/MID points). A defensively solid but low-scoring side
// should price up its defenders without inflating its forwards, and vice versa.
//
// Covers the confirmed 48-team 2026 World Cup field (hosts + qualifiers,
// including the four debutants — Cape Verde, Curaçao, Jordan, Uzbekistan —
// and play-off qualifiers DR Congo, Iraq, New Zealand).
const RATINGS: Record<string, { attack: number; defense: number }> = {
  // --- UEFA (16) ---
  france: { attack: 0.95, defense: 0.88 },
  england: { attack: 0.92, defense: 0.84 },
  spain: { attack: 0.92, defense: 0.84 },
  portugal: { attack: 0.9, defense: 0.82 },
  netherlands: { attack: 0.88, defense: 0.8 },
  germany: { attack: 0.88, defense: 0.8 },
  croatia: { attack: 0.74, defense: 0.86 },
  belgium: { attack: 0.82, defense: 0.74 },
  switzerland: { attack: 0.68, defense: 0.78 },
  norway: { attack: 0.8, defense: 0.7 }, // Haaland-powered attack outruns the rest of the side
  austria: { attack: 0.72, defense: 0.68 },
  scotland: { attack: 0.66, defense: 0.66 },
  sweden: { attack: 0.66, defense: 0.62 },
  turkey: { attack: 0.72, defense: 0.64 },
  'bosnia and herzegovina': { attack: 0.66, defense: 0.6 },
  czechia: { attack: 0.62, defense: 0.62 },
  'czech republic': { attack: 0.62, defense: 0.62 },

  // --- CONMEBOL (6) ---
  argentina: { attack: 0.9, defense: 0.92 },
  brazil: { attack: 0.95, defense: 0.84 },
  uruguay: { attack: 0.74, defense: 0.84 },
  colombia: { attack: 0.78, defense: 0.7 },
  ecuador: { attack: 0.64, defense: 0.7 },
  paraguay: { attack: 0.6, defense: 0.66 },

  // --- CONCACAF (6: 3 hosts + 3 direct qualifiers) ---
  usa: { attack: 0.74, defense: 0.7 },
  'united states': { attack: 0.74, defense: 0.7 },
  mexico: { attack: 0.74, defense: 0.66 },
  canada: { attack: 0.7, defense: 0.62 },
  panama: { attack: 0.56, defense: 0.58 },
  curacao: { attack: 0.5, defense: 0.56 },
  curaçao: { attack: 0.5, defense: 0.56 },
  haiti: { attack: 0.52, defense: 0.5 },

  // --- CAF (10, incl. DR Congo via play-off) ---
  morocco: { attack: 0.72, defense: 0.84 }, // 2022 semi-finalists — defense is the calling card
  senegal: { attack: 0.74, defense: 0.74 },
  egypt: { attack: 0.7, defense: 0.64 }, // Salah-led
  tunisia: { attack: 0.62, defense: 0.7 },
  algeria: { attack: 0.66, defense: 0.6 },
  ghana: { attack: 0.62, defense: 0.58 },
  'ivory coast': { attack: 0.66, defense: 0.58 },
  "côte d'ivoire": { attack: 0.66, defense: 0.58 },
  'south africa': { attack: 0.6, defense: 0.58 },
  'cape verde': { attack: 0.54, defense: 0.6 }, // surprise qualifiers — well-organized, limited going forward
  'dr congo': { attack: 0.58, defense: 0.54 },
  congo: { attack: 0.58, defense: 0.54 },

  // --- AFC (9, incl. Iraq via play-off) ---
  japan: { attack: 0.72, defense: 0.7 },
  'korea republic': { attack: 0.7, defense: 0.62 },
  'south korea': { attack: 0.7, defense: 0.62 }, // Son Heung-min
  iran: { attack: 0.6, defense: 0.66 },
  'saudi arabia': { attack: 0.56, defense: 0.58 },
  qatar: { attack: 0.52, defense: 0.54 },
  australia: { attack: 0.6, defense: 0.62 },
  jordan: { attack: 0.54, defense: 0.56 }, // debutants
  uzbekistan: { attack: 0.54, defense: 0.58 }, // debutants
  iraq: { attack: 0.54, defense: 0.56 },

  // --- OFC play-off (1) ---
  'new zealand': { attack: 0.5, defense: 0.54 },
}

const DEFAULT = { attack: 0.55, defense: 0.55 }

export function teamRatings(name: string | null | undefined): { attack: number; defense: number } {
  if (!name) return DEFAULT
  return RATINGS[name.trim().toLowerCase()] ?? DEFAULT
}
