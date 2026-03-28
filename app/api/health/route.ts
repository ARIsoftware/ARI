import { NextResponse } from "next/server"
import { pool } from "@/lib/db/pool"
import { getAuthenticatedUser } from "@/lib/auth-helpers"
import { safeErrorResponse } from "@/lib/api-error"

export const dynamic = "force-dynamic"

export async function GET() {
  const { user } = await getAuthenticatedUser()

  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 })
  }

  const checks: Record<string, { status: "ok" | "error"; message?: string }> = {}

  // Database check
  try {
    if (!pool) {
      checks.database = { status: "error", message: "DATABASE_URL not configured" }
    } else {
      const client = await pool.connect()
      await client.query("SELECT 1")
      client.release()
      checks.database = { status: "ok" }
    }
  } catch (err) {
    checks.database = {
      status: "error",
      message: safeErrorResponse(err),
    }
  }

  const allOk = Object.values(checks).every((c) => c.status === "ok")

  return NextResponse.json(
    { status: allOk ? "ok" : "error", checks },
    { status: allOk ? 200 : 503 }
  )
}
