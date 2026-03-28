import { NextResponse } from "next/server"
import { pool } from "@/lib/db/pool"
import { auth } from "@/lib/auth"

// In-memory flag to avoid repeated DB queries after first check
let initialized = false

export async function POST() {
  if (initialized) {
    return NextResponse.json({ status: "already_initialized" })
  }

  if (!pool) {
    return NextResponse.json({ status: "no_database" }, { status: 503 })
  }

  try {
    const result = await pool.query('SELECT COUNT(*) FROM public."user"')
    const count = parseInt(result.rows[0].count, 10)

    if (count > 0) {
      initialized = true
      return NextResponse.json({ status: "already_initialized" })
    }

    // No users exist — check for bootstrap credentials
    const email = process.env.ARI_FIRST_RUN_ADMIN_EMAIL
    const password = process.env.ARI_FIRST_RUN_ADMIN_PASSWORD

    if (!email || !password) {
      return NextResponse.json({ status: "no_users" })
    }

    // Create the admin user via Better Auth
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
  } catch (error: any) {
    // Handle duplicate user (race condition safety)
    if (error?.message?.includes("already exists") || error?.code === "23505") {
      initialized = true
      return NextResponse.json({ status: "already_initialized" })
    }
    console.error("Bootstrap error:", error)
    return NextResponse.json({ status: "error" }, { status: 500 })
  }
}
