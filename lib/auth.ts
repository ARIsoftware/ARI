import { betterAuth } from "better-auth"
import { nextCookies } from "better-auth/next-js"
import { Pool } from "pg"
import bcrypt from "bcryptjs"

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
        // Hash new passwords with bcrypt
        const salt = await bcrypt.genSalt(12)
        return await bcrypt.hash(password, salt)
      },
      verify: async ({ hash: storedHash, password }: { hash: string; password: string }) => {
        // Verify bcrypt hash (works for both old Supabase and new passwords)
        return await bcrypt.compare(password, storedHash)
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
