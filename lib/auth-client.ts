import { createAuthClient } from "better-auth/react"
import { twoFactorClient } from "better-auth/client/plugins"

export const authClient = createAuthClient({
  // Omit baseURL to use same-origin requests
  // This works regardless of what port the dev server runs on
  plugins: [twoFactorClient()],
})

// Re-export types from server auth for convenience
export type { Session, User } from "./auth"
