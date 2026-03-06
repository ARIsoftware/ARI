"use client"

import { useEffect, useState } from "react"
import { DatabaseErrorContent } from "@/components/database-error-content"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const [isDbError, setIsDbError] = useState(false)

  useEffect(() => {
    console.error("[App Error]", error)

    const msg = error.message?.toLowerCase() || ""

    // Use specific patterns to avoid false positives on generic words
    const isDatabase =
      msg.includes("database pool") ||
      msg.includes("database connection") ||
      msg.includes("econnrefused") ||
      msg.includes("connection pool") ||
      msg.includes("pool not initialized") ||
      msg.includes("postgres") ||
      msg.includes("supabase") ||
      /\bpg[_\s]/.test(msg)

    if (isDatabase) {
      setIsDbError(true)
      return
    }

    // Confirm via health endpoint for ambiguous errors
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    fetch("/api/health", { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) {
          try {
            const data = await res.json()
            if (data.checks?.database?.status === "error") {
              setIsDbError(true)
            }
          } catch {
            // Non-JSON response, not a confirmed DB error
          }
        }
      })
      .catch(() => {
        // Health endpoint unreachable — don't assume DB error
      })
      .finally(() => clearTimeout(timeout))

    return () => {
      controller.abort()
      clearTimeout(timeout)
    }
  }, [error])

  if (isDbError) {
    return <DatabaseErrorContent onRetry={reset} />
  }

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-8">
      <div className="text-center max-w-md">
        <h1 className="text-6xl font-bold mb-4">Error</h1>
        <p className="text-base font-normal text-gray-600 mb-6">
          Something went wrong. Please try again.
        </p>
        <button
          onClick={reset}
          className="bg-black text-white px-6 py-2 rounded hover:bg-gray-800 transition-colors text-sm"
        >
          Try again
        </button>
      </div>
    </div>
  )
}
