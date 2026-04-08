import { NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/auth-helpers"

export const dynamic = "force-dynamic"
export const debugRole = "health-resend"

export async function GET() {
  const { user } = await getAuthenticatedUser()

  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 })
  }

  const apiKey = process.env.RESEND_API_KEY

  if (!apiKey) {
    return NextResponse.json({ status: "not_set", message: "RESEND_API_KEY not configured" })
  }

  // Validate key format (Resend keys start with "re_")
  if (!apiKey.startsWith("re_")) {
    return NextResponse.json({ status: "error", message: "Invalid key format (should start with re_)" })
  }

  return NextResponse.json({ status: "ok" })
}
