"use client"

import { ClerkProvider } from "@clerk/nextjs"
import { ClerkErrorBoundary } from "@/components/clerk-error-boundary"
import { Toaster } from "@/components/ui/toaster"

export function Providers({ children }: { children: React.ReactNode }) {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY

  if (!publishableKey) {
    throw new Error("Missing NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY environment variable")
  }

  // Type assertion to handle React 19 compatibility
  const Provider = ClerkProvider as any

  return (
    <Provider
      publishableKey={publishableKey}
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
      </ClerkErrorBoundary>
    </Provider>
  )
}