import { MODULES_API_BASE } from "@/lib/license-helpers"
import { pool } from "@/lib/db/pool"
import { getAriInstance } from "./instance"

export type TelemetryEvent = "ari_started" | "first_login"

const PLATFORM: "darwin" | "linux" | "windows" =
  process.platform === "darwin" ? "darwin" : process.platform === "win32" ? "windows" : "linux"

/**
 * Fire-and-forget telemetry ping. Swallows all errors silently so it can
 * never break startup or sign-in. Two trigger paths:
 *   - "ari_started"  — sent on every server-process startup, but only AFTER
 *                      the first sign-in has occurred (gated on
 *                      first_signin_pinged so we don't emit "started"
 *                      events for installs that have never been used).
 *   - "first_login"  — sent exactly once per install, the first time any
 *                      user successfully signs in. Carries that user's
 *                      email as `username`. The caller is responsible for
 *                      claiming the once-per-install slot via
 *                      tryClaimFirstSigninPing() before invoking this.
 */
export async function sendTvConnect(opts: { event?: TelemetryEvent; username?: string } = {}): Promise<void> {
  const event: TelemetryEvent = opts.event ?? "ari_started"
  try {
    const instance = await getAriInstance()
    if (!instance || !instance.telemetryEnabled) return

    // Startup pings only fire after the first sign-in has registered the install.
    if (event === "ari_started" && !instance.firstSigninPinged) return

    let username = opts.username ?? ""
    if (!username && pool) {
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
      event,
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
