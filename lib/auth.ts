import { betterAuth } from "better-auth"
import { nextCookies } from "better-auth/next-js"
import { twoFactor } from "better-auth/plugins/two-factor"
import { hash as argon2Hash, verify as argon2Verify } from "@node-rs/argon2"
import { pool } from "@/lib/db/pool"
import { getAriInstance, tryClaimFirstSigninPing } from "@/lib/telemetry/instance"
import { sendTvConnect } from "@/lib/telemetry/send-tv-connect"

// Short-circuits the session-create hook after we've confirmed (or sent) the
// one-shot first-login ping. Keeps subsequent sign-ins from hitting the DB
// for a flag that can never flip back.
let firstSigninPingResolved = false

// Build trusted origins
const trustedOrigins: string[] = []

// Add production domain from env
if (process.env.NEXT_PUBLIC_APP_URL) {
  trustedOrigins.push(process.env.NEXT_PUBLIC_APP_URL)
}

// Add Vercel preview URLs
if (process.env.VERCEL_URL) {
  trustedOrigins.push(`https://${process.env.VERCEL_URL}`)
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

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  database: pool as any, // Will be null during build, but auth-helpers catches this
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
  // Cache session in a signed cookie to avoid DB hits on every get-session call
  // This prevents 429s when many tabs are open simultaneously
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24,       // refresh session expiry every 1 day of activity
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5 minutes
    },
  },
  // Rate limiting to prevent brute force attacks
  rateLimit: {
    enabled: true,
    window: 60, // 1 minute window
    max: 30, // Maximum 30 attempts per window (increased for session checks)
    // Stricter limits for sign-in endpoint
    customRules: {
      "/sign-in/*": {
        window: 300, // 5 minute window
        max: 5, // Only 5 sign-in attempts per 5 minutes
      },
      "/sign-up/*": {
        window: 300, // 5 minute window
        max: 3, // Only 3 sign-up attempts per 5 minutes
      },
      "/two-factor/verify-totp": {
        window: 60,
        max: 5, // Only 5 TOTP attempts per minute
      },
      "/get-session": {
        window: 60,
        max: 500, // Session checks are read-only and cookie-cached, safe to allow many
      },
    },
  },
  databaseHooks: {
    session: {
      create: {
        after: async (session) => {
          if (firstSigninPingResolved) return
          void (async () => {
            try {
              const instance = await getAriInstance()
              if (!instance || !instance.telemetryEnabled) return
              if (instance.firstSigninPinged) {
                firstSigninPingResolved = true
                return
              }
              if (!pool) return

              // Claim the once-per-install slot BEFORE sending. If another
              // concurrent sign-in already claimed it, bail. If we claim it
              // and the send later fails, we lose this one ping — but we'll
              // never double-fire, which the upstream telemetry prefers.
              const claimed = await tryClaimFirstSigninPing()
              if (!claimed) {
                firstSigninPingResolved = true
                return
              }

              const { rows } = await pool.query<{ email: string }>(
                'SELECT email FROM "user" WHERE id = $1 LIMIT 1',
                [session.userId]
              )
              const email = rows[0]?.email
              if (!email) {
                firstSigninPingResolved = true
                return
              }

              await sendTvConnect({ event: "first_login", username: email })
              firstSigninPingResolved = true
            } catch {
              // never break auth on telemetry failure
            }
          })()
        },
      },
    },
  },
  plugins: [
    twoFactor({
      issuer: "ARI",
    }),
    nextCookies(),
  ],
})
