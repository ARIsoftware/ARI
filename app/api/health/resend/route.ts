import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET() {
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
