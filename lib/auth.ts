import { betterAuth } from "better-auth"
import { nextCookies } from "better-auth/next-js"
import { Pool } from "pg"
import { hash as argon2Hash, verify as argon2Verify } from "@node-rs/argon2"

// Lazy initialization to avoid build-time errors when env vars aren't available
let _auth: ReturnType<typeof betterAuth> | null = null

function createAuth() {
  // Validate required environment variables at runtime
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is required')
  }
  if (!process.env.BETTER_AUTH_SECRET || process.env.BETTER_AUTH_SECRET.length < 32) {
    throw new Error('BETTER_AUTH_SECRET must be set and at least 32 characters')
  }

  // Create PostgreSQL pool with SSL for Supabase
  // In production, validate SSL certificates to prevent MITM attacks
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: true }
      : { rejectUnauthorized: false },
  })

  // Build trusted origins from environment
  const trustedOrigins: string[] = []
  if (process.env.NEXT_PUBLIC_APP_URL) {
    trustedOrigins.push(process.env.NEXT_PUBLIC_APP_URL)
  }
  // Only add localhost origins in development
  if (process.env.NODE_ENV !== 'production') {
    trustedOrigins.push(
      "http://localhost:3000",
      "http://localhost:3001",
      "http://localhost:3002",
      "http://localhost:3003"
    )
  }

  return betterAuth({
    database: pool,
    trustedOrigins,
    emailAndPassword: {
      enabled: true,
      password: {
        minLength: 18,
        hash: async (password: string) => {
          // Hash passwords with Argon2id (winner of Password Hashing Competition)
          return await argon2Hash(password, {
            memoryCost: 19456, // 19 MiB
            timeCost: 2,
            parallelism: 1,
          })
        },
        verify: async ({ hash: storedHash, password }: { hash: string; password: string }) => {
          // Verify with Argon2
          return await argon2Verify(storedHash, password)
        },
      },
    },
    user: {
      additionalFields: {
        firstName: { type: "string", required: false },
        lastName: { type: "string", required: false },
      },
    },
    // Rate limiting to prevent brute force attacks
    rateLimit: {
      enabled: true,
      window: 60, // 1 minute window
      max: 10, // Maximum 10 attempts per window
      // Stricter limits for sign-in endpoint
      customRules: {
        "/sign-in/*": {
          window: 60,
          max: 5, // Only 5 sign-in attempts per minute
        },
        "/sign-up/*": {
          window: 300, // 5 minute window
          max: 3, // Only 3 sign-up attempts per 5 minutes
        },
      },
    },
    plugins: [nextCookies()],
  })
}

// Export auth with lazy initialization
export const auth = new Proxy({} as ReturnType<typeof betterAuth>, {
  get(_, prop) {
    if (!_auth) {
      _auth = createAuth()
    }
    return (_auth as any)[prop]
  },
})

// Export types for use in components
export type Session = typeof auth.$Infer.Session
export type User = typeof auth.$Infer.Session.user
