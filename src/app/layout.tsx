import type { Metadata } from 'next'
import { DM_Sans, IBM_Plex_Mono, Fraunces } from 'next/font/google'
import './globals.css'

const sans = DM_Sans({ subsets: ['latin'], variable: '--font-dm-sans' })
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400','500','600'], variable: '--font-ibm-mono' })
const display = Fraunces({ subsets: ['latin'], variable: '--font-fraunces' })

export const metadata: Metadata = {
  title: 'Threshold — DC energy program eligibility',
  description: 'Review household facts and see which DC energy programs may fit.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" className={`${sans.variable} ${mono.variable} ${display.variable}`}><body>{children}</body></html>
}
