import { NextRequest, NextResponse } from "next/server"
import { pool } from "@/lib/db/pool"
import { auth } from "@/lib/auth"
import { setupSql } from "@/lib/db/setup-sql"
import { checkRateLimit, getClientIp } from "@/lib/modules/public-route-security"

export const debugRole = "auth-bootstrap"
// Intentionally public — only succeeds when zero users exist (first-run admin setup)
export const isPublic = true

export type BootstrapStatus =
  | "already_initialized"
  | "created"
  | "installed"
  | "no_users"
  | "no_database"
  | "install_failed"
  | "error"

// Fast-path flag: skip all DB work once we've confirmed init in this process.
let initialized = false

// Constant key for pg_advisory_lock so concurrent first-visits serialize on
// schema install instead of racing.
const BOOTSTRAP_LOCK_KEY = 9173451

export async function POST(request: NextRequest) {
  if (!checkRateLimit(`bootstrap:${getClientIp(request)}`, 3)) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please try again later." },
      { status: 429 }
    )
  }

  const origin = request.headers.get("origin")
  const referer = request.headers.get("referer")
  if (!origin && !referer) {
    return NextResponse.json(
      { error: "Missing origin header" },
      { status: 400 }
    )
  }

  if (initialized) {
    return NextResponse.json({ status: "already_initialized" })
  }

  if (!pool) {
    return NextResponse.json({ status: "no_database" }, { status: 503 })
  }

  const client = await pool.connect()
  let lockHeld = false
  try {
    await client.query("SELECT pg_advisory_lock($1::bigint)", [BOOTSTRAP_LOCK_KEY])
    lockHeld = true

    // Check whether the schema is installed by looking for the canary user table.
    const regResult = await client.query(`SELECT to_regclass('public."user"') AS reg`)
    const schemaPresent = regResult.rows[0]?.reg !== null

    if (!schemaPresent) {
      try {
        await client.query(setupSql)
      } catch (installError: any) {
        const message = installError instanceof Error ? installError.message : String(installError)
        console.error("Bootstrap install failed:", installError)
        return NextResponse.json(
          { status: "install_failed", error: message },
          { status: 500 }
        )
      }
    }

    const countResult = await client.query('SELECT COUNT(*) FROM public."user"')
    const count = parseInt(countResult.rows[0].count, 10)

    if (count > 0) {
      initialized = true
      return NextResponse.json({ status: "already_initialized" })
    }

    const email = process.env.ARI_FIRST_RUN_ADMIN_EMAIL
    const password = process.env.ARI_FIRST_RUN_ADMIN_PASSWORD

    if (!email || !password) {
      // Schema is present but no admin to create. Caller decides UX.
      return NextResponse.json({ status: schemaPresent ? "no_users" : "installed" })
    }

    try {
      const response = await auth.api.signUpEmail({
        body: {
          email,
          password,
          name: email.split("@")[0],
        },
      })

      if (!response) {
        return NextResponse.json({ status: "error" }, { status: 500 })
      }

      initialized = true
      return NextResponse.json({ status: "created" })
    } catch (error: unknown) {
      // Race-safety: another request created the user between our count and signUp.
      const message = error instanceof Error ? error.message : ""
      const code = (error as { code?: string } | null)?.code
      if (message.includes("already exists") || code === "23505") {
        initialized = true
        return NextResponse.json({ status: "already_initialized" })
      }
      console.error("Bootstrap signup error:", error)
      return NextResponse.json({ status: "error" }, { status: 500 })
    }
  } catch (error: unknown) {
    console.error("Bootstrap error:", error)
    return NextResponse.json({ status: "error" }, { status: 500 })
  } finally {
    if (lockHeld) {
      try {
        await client.query("SELECT pg_advisory_unlock($1::bigint)", [BOOTSTRAP_LOCK_KEY])
      } catch {}
    }
    client.release()
  }
}
