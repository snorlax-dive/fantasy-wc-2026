import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { AppChrome } from '@/components/app-chrome'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Fantasy World Cup 2026',
  description: 'Predictions, fantasy squads, brackets and blocks for the 2026 World Cup.',
  appleWebApp: { capable: true, title: 'Fantasy WC', statusBarStyle: 'default' },
}

export const viewport = {
  themeColor: '#e4002b',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <AppChrome>{children}</AppChrome>
      </body>
    </html>
  )
}
