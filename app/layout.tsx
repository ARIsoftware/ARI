import type React from "react"
import type { Metadata } from "next"
import { Providers } from "@/components/providers"
import { QueryProvider } from "@/components/query-provider"
import { getInstalledModules, getDuplicateModuleErrors } from "@/lib/modules"
import { getEnabledModules } from "@/lib/modules/module-registry"
import { getAuthenticatedUser } from "@/lib/auth-helpers"
import { ModuleErrorOverlay } from "@/components/module-error-overlay"
import "./globals.css"

// Force dynamic rendering to ensure auth state is fresh on every request
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: "ARI",
  description: "ARI.Software",
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
    const { user, withRLS } = await getAuthenticatedUser()
    if (user && withRLS) {
      // Fetch modules and features in parallel
      const { userFeaturePreferences } = await import('@/lib/db/schema')
      const [modules, featurePrefs] = await Promise.all([
        getEnabledModules(user.id),
        withRLS((db) =>
          db.select({
            featureName: userFeaturePreferences.featureName,
            enabled: userFeaturePreferences.enabled
          })
          .from(userFeaturePreferences)
        )
      ])

      enabledModules = modules

      // Convert features array to map
      if (featurePrefs) {
        initialFeatures = {}
        featurePrefs.forEach((pref) => {
          initialFeatures![pref.featureName] = pref.enabled
        })
      }
    }
  } catch (error) {
    // User not authenticated or error fetching - sidebar will load without modules
    console.log('[Layout] No authenticated user for server-side loading')
  }

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="robots" content="noindex, nofollow" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#000000" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="ARI" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Crimson+Pro:ital,wght@0,200..900;1,200..900&family=Geist+Mono:wght@100..900&family=Geist:wght@100..900&family=Google+Sans+Flex:opsz,wght@6..144,1..1000&family=Google+Sans:ital,opsz,wght@0,17..18,400..700;1,17..18,400..700&family=Montserrat:ital,wght@0,100..900;1,100..900&family=Open+Sans:ital,wght@0,300..800;1,300..800&family=Outfit:wght@100..900&family=Overpass+Mono:wght@300..700&family=Raleway:ital,wght@0,100..900;1,100..900&family=Science+Gothic:wght@100..900&display=swap" rel="stylesheet" />
        {/* Inline script to apply theme/font immediately before React hydration to prevent FOUT */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var c=localStorage.getItem('ari-theme-cache');if(c){var s=JSON.parse(c);var fonts={'overpass-mono':'"Overpass Mono", monospace','geist':'"Geist", sans-serif','geist-mono':'"Geist Mono", monospace','open-sans':'"Open Sans", sans-serif','outfit':'"Outfit", sans-serif','science-gothic':'"Science Gothic", sans-serif','inter':'"Inter", sans-serif','jetbrains-mono':'"JetBrains Mono", monospace','ibm-plex-sans':'"IBM Plex Sans", sans-serif','fira-code':'"Fira Code", monospace','crimson-pro':'"Crimson Pro", serif'};if(s.activeFont&&fonts[s.activeFont]){document.documentElement.style.setProperty('--font-family',fonts[s.activeFont])}}}catch(e){}})();`,
          }}
        />
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
        <QueryProvider>
          {duplicateErrors.length > 0 ? (
            <ModuleErrorOverlay errors={duplicateErrors} />
          ) : (
            <Providers modules={installedModules} enabledModules={enabledModules} initialFeatures={initialFeatures}>{children}</Providers>
          )}
        </QueryProvider>
      </body>
    </html>
  )
}
