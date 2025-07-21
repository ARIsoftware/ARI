"use client"

import type React from "react"

import { useEffect, useState } from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertTriangle } from "lucide-react"

export function ClerkErrorBoundary({ children }: { children: React.ReactNode }) {
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    // Check if Clerk environment variables are present
    const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY

    if (!publishableKey) {
      setHasError(true)
    }
  }, [])

  if (hasError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
        <div className="max-w-md w-full">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Configuration Error</AlertTitle>
            <AlertDescription className="mt-2">
              <p className="mb-2">Missing Clerk configuration. Please:</p>
              <ol className="list-decimal list-inside space-y-1 text-sm">
                <li>
                  Create a <code className="bg-gray-100 px-1 rounded">.env.local</code> file in your project root
                </li>
                <li>Add your Clerk keys from the dashboard</li>
                <li>Restart your development server</li>
              </ol>
              <p className="mt-2 text-sm">
                Get your keys at:{" "}
                <a
                  href="https://dashboard.clerk.com/last-active?path=api-keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  Clerk Dashboard
                </a>
              </p>
            </AlertDescription>
          </Alert>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
