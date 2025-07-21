"use client"

import type React from "react"

export function ClerkErrorBoundary({ children }: { children: React.ReactNode }) {
  // Temporarily ignore all Clerk errors
  return <>{children}</>
}
