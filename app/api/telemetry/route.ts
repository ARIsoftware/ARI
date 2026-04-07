import { NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/auth-helpers"
import { getAriInstance, setTelemetryEnabled } from "@/lib/telemetry/instance"

export async function GET() {
  const { user } = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const instance = await getAriInstance()
  if (!instance) return NextResponse.json({ error: "Unavailable" }, { status: 500 })
  return NextResponse.json({ telemetryEnabled: instance.telemetryEnabled })
}

export async function PUT(request: Request) {
  const { user } = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body || typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  }

  await setTelemetryEnabled(body.enabled)
  return NextResponse.json({ telemetryEnabled: body.enabled })
}
