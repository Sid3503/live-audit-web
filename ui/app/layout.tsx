import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "User Journey Auditor",
  description: "AI-powered UX audit tool that maps user journeys and detects friction points.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
