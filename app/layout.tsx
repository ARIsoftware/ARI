import type React from "react"
import type { Metadata } from "next"
import { ClerkProvider } from "@clerk/nextjs"
import { ClerkErrorBoundary } from "@/components/clerk-error-boundary"
import { Toaster } from "@/components/ui/toaster"
import { headers } from "next/headers"
import "./globals.css"

export const metadata: Metadata = {
  title: "ARI-2 App",
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
  // Set X-Robots-Tag header
  const headersList = await headers()

  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY

  if (!publishableKey) {
    throw new Error("Missing NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY environment variable")
  }

  return (
    <ClerkProvider
      publishableKey={publishableKey}
      appearance={{
        baseTheme: undefined,
        variables: {
          colorPrimary: "#000000",
        },
      }}
    >
      <html lang="en">
        <head>
          <meta name="robots" content="noindex, nofollow" />
        </head>
        <body>
          <ClerkErrorBoundary>
            {children}
            <Toaster />
          </ClerkErrorBoundary>
        </body>
      </html>
    </ClerkProvider>
  )
}
