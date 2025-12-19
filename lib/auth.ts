import { betterAuth } from "better-auth"
import { nextCookies } from "better-auth/next-js"
import { Pool } from "pg"
import { hash as argon2Hash, verify as argon2Verify } from "@node-rs/argon2"

// Create PostgreSQL pool with SSL for Supabase
const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  ssl: {
    rejectUnauthorized: false,
  },
})

export const auth = betterAuth({
  database: pool,
  trustedOrigins: [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:3002",
    "http://localhost:3003",
  ],
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
  plugins: [nextCookies()],
})

// Export types for use in components
export type Session = typeof auth.$Infer.Session
export type User = typeof auth.$Infer.Session.user
