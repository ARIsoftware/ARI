import { betterAuth } from "better-auth"
import { APIError } from "better-auth/api"
import { nextCookies } from "better-auth/next-js"
import { twoFactor } from "better-auth/plugins/two-factor"
import { hash as argon2Hash, verify as argon2Verify } from "@node-rs/argon2"
import { pool } from "@/lib/db/pool"
// Regenerated on every predev/prebuild — reflects the modules actually on
// disk in this build (same pattern as middleware.ts).
import moduleManifest from "@/lib/generated/module-manifest.json"
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

/**
 * Hash a password with Argon2id (winner of the Password Hashing Competition).
 * Shared by the Better Auth config below and the Users module's admin API
 * (modules-custom/ari-users/api), so admin-set passwords hash identically to
 * sign-up ones.
 */
export async function hashPassword(password: string): Promise<string> {
  return await argon2Hash(password, {
    memoryCost: 19456, // 19 MiB
    timeCost: 2,
    parallelism: 1,
  })
}

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  database: pool as any, // Will be null during build, but auth-helpers catches this
  trustedOrigins,
  emailAndPassword: {
    enabled: true,
    password: {
      minLength: 18,
      hash: hashPassword,
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
      // Multi-user fields. input: false — only the Users admin API may set
      // these; they must never be client-assignable at sign-up. Authoritative
      // permission checks read the DB row (lib/permissions.ts), not the
      // session payload, so a stale cookie cache can't grant stale access.
      role: { type: "string", required: false, input: false, defaultValue: "user" },
      disabled: { type: "boolean", required: false, input: false, defaultValue: false },
    },
  },
  // Cache session in a signed cookie to avoid DB hits on every get-session call
  // This prevents 429s when many tabs are open simultaneously.
  //
  // maxAge also bounds how long a revoked/disabled account can keep calling
  // Better Auth's OWN endpoints (e.g. update-user, two-factor) that validate
  // from this cache without a DB read. ARI's own API routes are unaffected —
  // getAuthenticatedUser re-reads the live DB row (and verifies the session
  // still exists) on every request — so 60s is a safe, tighter bound for the
  // few self-scoped Better Auth endpoints while keeping get-session cheap.
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24,       // refresh session expiry every 1 day of activity
    cookieCache: {
      enabled: true,
      maxAge: 60, // 1 minute
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
    user: {
      create: {
        before: async (user) => {
          // Single-user cap: without the Users module installed (its code
          // present in this build), ARI is single-user — only the first
          // account may ever be created. The check is on module PRESENCE,
          // not the per-user enabled flag: installing the module is the key
          // that unlocks multi-user. The module's own admin API inserts user
          // rows directly (not via Better Auth), so it is unaffected here.
          const multiUserInstalled = moduleManifest.modules.some(
            (m: { id: string }) => m.id === "ari-users"
          )
          if (pool && !multiUserInstalled) {
            let hasUsers = false
            try {
              const { rows } = await pool.query<{ count: string }>(
                'SELECT COUNT(*) AS count FROM "user"'
              )
              hasUsers = parseInt(rows[0]?.count ?? "0", 10) >= 1
            } catch {
              // Never break account creation on a lookup failure (e.g. a
              // fresh install before setup.sql created the table) — the
              // first-run bootstrap must always succeed, and middleware
              // still blocks public sign-up.
            }
            if (hasUsers) {
              throw new APIError("FORBIDDEN", {
                message:
                  "This ARI install is single-user. Install the Users module to add more accounts.",
              })
            }
          }
          return { data: user }
        },
      },
    },
    session: {
      create: {
        before: async (session) => {
          // Disabled accounts must not be able to sign in. Request-time
          // enforcement lives in getAuthenticatedUser(); this hook just
          // rejects new sessions up front for a clear sign-in error.
          if (pool) {
            let isDisabled = false
            try {
              const { rows } = await pool.query<{ disabled: boolean }>(
                'SELECT "disabled" FROM "user" WHERE id = $1 LIMIT 1',
                [session.userId]
              )
              isDisabled = rows[0]?.disabled === true
            } catch {
              // Never break sign-in on a lookup failure (e.g. mid-upgrade
              // before setup.sql added the column) — request-time checks
              // in getAuthenticatedUser() still enforce the flag.
            }
            if (isDisabled) {
              throw new APIError("FORBIDDEN", {
                message: "This account has been disabled. Contact your administrator.",
              })
            }
          }
          return { data: session }
        },
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
