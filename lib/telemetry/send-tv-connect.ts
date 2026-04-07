import { MODULES_API_BASE } from "@/lib/license-helpers"
import { getAriInstance } from "./instance"

const PLATFORM: "darwin" | "linux" | "windows" =
  process.platform === "darwin" ? "darwin" : process.platform === "win32" ? "windows" : "linux"

/**
 * Fire-and-forget anonymous install ping. Sent once per server process startup
 * (from instrumentation.ts) when telemetry is enabled. Swallows all errors.
 */
export async function sendTvConnect(): Promise<void> {
  try {
    const instance = await getAriInstance()
    if (!instance || !instance.telemetryEnabled) return

    const payload = {
      instance_id: instance.id,
      event: "ari_started" as const,
      ari_version: process.env.NEXT_PUBLIC_ARI_VERSION || "0.0.0",
      platform: PLATFORM,
      timestamp: new Date().toISOString(),
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
