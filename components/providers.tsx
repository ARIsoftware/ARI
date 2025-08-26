"use client"

import { ClerkProvider } from "@clerk/nextjs"
import { ClerkErrorBoundary } from "@/components/clerk-error-boundary"
import { Toaster } from "@/components/ui/toaster"
import { RLSDebug } from "@/components/rls-debug"

export function Providers({ children }: { children: React.ReactNode }) {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY

  if (!publishableKey) {
    throw new Error("Missing NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY environment variable")
  }

  // Type assertion to handle React 19 compatibility
  const Provider = ClerkProvider as any

  // Determine if we're on localhost
  const isLocalhost = typeof window !== 'undefined' && window.location.hostname === 'localhost'
  const redirectUrl = isLocalhost ? 'http://localhost:3000/' : '/'

  return (
    <Provider
      publishableKey={publishableKey}
      signInFallbackRedirectUrl={redirectUrl}
      signUpFallbackRedirectUrl={redirectUrl}
      afterSignInUrl={redirectUrl}
      afterSignUpUrl={redirectUrl}
      appearance={{
        baseTheme: undefined,
        variables: {
          colorPrimary: "#000000",
        },
      }}
    >
      <ClerkErrorBoundary>
        {children}
        <Toaster />
        <RLSDebug />
      </ClerkErrorBoundary>
    </Provider>
  )
}
