import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'AutoCorp — Autonomous Business Engine',
  description: 'Deploy AI-powered autonomous businesses on Ethereum Sepolia. Real-time multi-agent orchestration with Gemini AI.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300..800&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-[#030712] antialiased">
        {children}
      </body>
    </html>
  )
}
