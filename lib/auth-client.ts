import { createAuthClient } from "better-auth/react"

export const authClient = createAuthClient({
  // Omit baseURL to use same-origin requests
  // This works regardless of what port the dev server runs on
})

// Re-export types from server auth for convenience
export type { Session, User } from "./auth"
