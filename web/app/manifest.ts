import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Fantasy World Cup 2026',
    short_name: 'Fantasy WC',
    description: 'Predictions, fantasy squads, brackets & blocks for the 2026 World Cup.',
    start_url: '/',
    display: 'standalone',
    background_color: '#eef1f5',
    theme_color: '#e4002b',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
    ],
  }
}
