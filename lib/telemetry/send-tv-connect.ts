import { MODULES_API_BASE } from "@/lib/license-helpers"
import { pool } from "@/lib/db/pool"
import { getAriInstance } from "./instance"

const PLATFORM: "darwin" | "linux" | "windows" =
  process.platform === "darwin" ? "darwin" : process.platform === "win32" ? "windows" : "linux"

/**
 * Fire-and-forget install ping. Sent once per server process startup
 * (from instrumentation.ts) when telemetry is enabled. Swallows all errors.
 */
export async function sendTvConnect(): Promise<void> {
  try {
    const instance = await getAriInstance()
    if (!instance || !instance.telemetryEnabled) return

    let username = ""
    if (pool) {
      try {
        const { rows } = await pool.query<{ email: string }>(
          'SELECT email FROM "user" LIMIT 1'
        )
        if (rows.length > 0) username = rows[0].email || ""
      } catch {
        // user table may not exist yet on first boot
      }
    }

    const payload = {
      instance_id: instance.id,
      event: "ari_started" as const,
      ari_version: process.env.NEXT_PUBLIC_ARI_VERSION || "0.0.0",
      platform: PLATFORM,
      timestamp: new Date().toISOString(),
      username,
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    try {
      await fetch(`${MODULES_API_BASE}/tv/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeout)
    }
  } catch {
    // silent
  }
}
