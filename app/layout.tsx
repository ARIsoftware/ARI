import type React from "react"
import type { Metadata } from "next"
import { Providers } from "@/components/providers"
import { getInstalledModules, getDuplicateModuleErrors } from "@/lib/modules"
import { getEnabledModules } from "@/lib/modules/module-registry"
import { getAuthenticatedUser } from "@/lib/auth-helpers"
import { ModuleErrorOverlay } from "@/components/module-error-overlay"
import "./globals.css"

// Force dynamic rendering to ensure auth state is fresh on every request
export const dynamic = 'force-dynamic'

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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // Scan installed modules on server side and pass to client providers
  const installedModules = getInstalledModules()

  // Check for duplicate module IDs (critical error that blocks the app)
  const duplicateErrors = getDuplicateModuleErrors()

  // Fetch enabled modules and features server-side for authenticated users
  // This eliminates the "Loading..." flash in the sidebar
  let enabledModules: Awaited<ReturnType<typeof getEnabledModules>> = []
  let initialFeatures: Record<string, boolean> | undefined = undefined

  try {
    const { user, supabase } = await getAuthenticatedUser()
    if (user) {
      // Fetch modules and features in parallel
      const [modules, featuresResult] = await Promise.all([
        getEnabledModules(user.id),
        supabase.from('user_feature_preferences').select('feature_name, enabled')
      ])

      enabledModules = modules

      // Convert features array to map
      if (featuresResult.data) {
        initialFeatures = {}
        featuresResult.data.forEach((pref: { feature_name: string; enabled: boolean }) => {
          initialFeatures![pref.feature_name] = pref.enabled
        })
      }
    }
  } catch (error) {
    // User not authenticated or error fetching - sidebar will load without modules
    console.log('[Layout] No authenticated user for server-side loading')
  }

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
        <link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600;700&family=Open+Sans:ital,wght@0,300..800;1,300..800&family=Outfit:wght@100..900&family=Overpass+Mono:wght@300..700&family=Science+Gothic:wght@100..900&display=swap" rel="stylesheet" />
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
          <Providers modules={installedModules} enabledModules={enabledModules} initialFeatures={initialFeatures}>{children}</Providers>
        )}
      </body>
    </html>
  )
}
