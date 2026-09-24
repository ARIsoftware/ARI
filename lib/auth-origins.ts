/**
 * LAN trusted origins for Better Auth (development only).
 *
 * `./ari start --lan` binds the dev server to 0.0.0.0 so a phone or a second
 * machine can reach ARI at e.g. http://192.168.1.42:3000. Better Auth
 * validates the Origin/Referer of every mutating request against
 * `trustedOrigins`; a hardcoded localhost list rejects that LAN origin with
 * 403 INVALID_ORIGIN, so sign-in never issues a session cookie and every data
 * API answers 401 — which reads like "the database is broken".
 *
 * The machine's LAN address can't be baked in at boot (DHCP changes it, and a
 * host can have several interfaces), so we derive the origin from the request
 * instead and allow it only when it is a LITERAL private address.
 *
 * Why literal-only: the origin check is CSRF defense. A cross-origin page
 * can't forge the Origin header, but a DNS-rebinding page can — it owns a NAME
 * whose record flips to the victim's private IP, so Host and Origin both say
 * `rebind.attacker.com`. Names are therefore never trusted here, only address
 * literals, which cannot be rebound. Same reasoning as `isDirectAddressHost()`
 * in `lib/modules/public-route-security.ts`.
 *
 * Reaching a dev instance through a hostname (`ari.local`, a NAS name,
 * Tailscale MagicDNS) is still supported — set `NEXT_PUBLIC_APP_URL` or
 * `BETTER_AUTH_TRUSTED_ORIGINS` to that origin explicitly.
 *
 * `./ari start --tunnel` is the one hostname case ARI handles itself: the CLI
 * opens a Cloudflare Quick Tunnel, learns its random `*.trycloudflare.com`
 * origin, and passes it to the dev server as `ARI_TUNNEL_ORIGIN`. That is
 * consistent with the rule above — the origin is configured by the process
 * that created it (server-side, before boot), never inferred from a request
 * header — so a rebinding page gains nothing. See `tunnelTrustedOrigins()`.
 */

/** IPv4 literal, e.g. 192.168.1.42 */
const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/

/**
 * True when `hostname` is a literal address on a private/loopback network.
 * Accepts bracketed or bare IPv6 (URL.hostname keeps the brackets).
 */
export function isPrivateAddressHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[/, '').replace(/\]$/, '')
  if (!host) return false

  if (host === 'localhost') return true

  const v4 = IPV4.exec(host)
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])]
    if (a > 255 || b > 255 || Number(v4[3]) > 255 || Number(v4[4]) > 255) return false
    if (a === 127) return true // loopback
    if (a === 10) return true // 10.0.0.0/8
    if (a === 192 && b === 168) return true // 192.168.0.0/16
    if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12
    if (a === 169 && b === 254) return true // link-local
    return false
  }

  if (host === '::1') return true // IPv6 loopback
  if (/^f[cd][0-9a-f]{0,2}:/.test(host)) return true // unique local fc00::/7
  if (/^fe80:/.test(host)) return true // IPv6 link-local
  return false
}

/**
 * The request's own origin, when it points at a literal private address.
 * Returns `[]` otherwise, so it can be spread into a trusted-origins list.
 *
 * Origin is preferred over Referer because that's the order Better Auth's
 * own check uses — the value we return has to match the header it compares.
 */
export function privateNetworkTrustedOrigins(request?: Request | null): string[] {
  const headers = request?.headers
  if (!headers) return []

  const candidates = [headers.get('origin'), headers.get('referer')]
  for (const candidate of candidates) {
    if (!candidate || candidate === 'null') continue
    let url: URL
    try {
      url = new URL(candidate)
    } catch {
      continue
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') continue
    if (isPrivateAddressHost(url.hostname)) return [url.origin]
  }
  return []
}

/**
 * The public origin `./ari start --tunnel` exposed this session on, when
 * set. The CLI sets `ARI_TUNNEL_ORIGIN` on the dev-server process only; it
 * is never written to `.env.local`. Only an `https:` origin qualifies (Quick
 * Tunnels terminate TLS at Cloudflare's edge), and the value is normalised to
 * a bare origin because Better Auth compares trusted origins exactly.
 * Returns `[]` when unset or malformed, so it can be spread into a list.
 */
export function tunnelTrustedOrigins(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string[] {
  const value = env.ARI_TUNNEL_ORIGIN?.trim()
  if (!value) return []
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return []
  }
  if (url.protocol !== 'https:') return []
  return [url.origin]
}
