import type React from "react"
import type { Metadata } from "next"
import { Providers } from "@/components/providers"
import { getInstalledModules, getDuplicateModuleErrors } from "@/lib/modules"
import { ModuleErrorOverlay } from "@/components/module-error-overlay"
import "./globals.css"

export const metadata: Metadata = {
  title: "ARI",
  description: "Secure task management application",
  generator: "v0.dev",
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // Scan installed modules on server side and pass to client providers
  const installedModules = getInstalledModules()

  // Check for duplicate module IDs (critical error that blocks the app)
  const duplicateErrors = getDuplicateModuleErrors()

  return (
    <html lang="en">
      <head>
        <meta name="robots" content="noindex, nofollow" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#000000" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="ARI" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Overpass+Mono:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
        <script
          type="speculationrules"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              prerender: [{ where: { href_matches: "/*" }, eagerness: "moderate" }],
              prefetch: [{ where: { href_matches: "/*" }, eagerness: "moderate" }],
            }),
          }}
        />
      </head>
      <body>
        {duplicateErrors.length > 0 ? (
          <ModuleErrorOverlay errors={duplicateErrors} />
        ) : (
          <Providers modules={installedModules}>{children}</Providers>
        )}
      </body>
    </html>
  )
}
