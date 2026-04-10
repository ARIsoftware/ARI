import crypto from 'crypto'
import { eq, and, sql } from 'drizzle-orm'
import { withAdminDb } from '@/lib/db'
import { apiKeys, apiKeyUsageLogs } from '@/lib/db/schema/core-schema'

const API_KEY_PREFIX = 'ari_k_'

export function generateApiKey(): { rawKey: string; keyHash: string; keyPrefix: string } {
  const randomBytes = crypto.randomBytes(32).toString('hex')
  const rawKey = `${API_KEY_PREFIX}${randomBytes}`
  const keyHash = hashApiKey(rawKey)
  const keyPrefix = rawKey.substring(0, 12)
  return { rawKey, keyHash, keyPrefix }
}

/** No salt needed — keys have 128 bits of entropy */
export function hashApiKey(rawKey: string): string {
  return crypto.createHash('sha256').update(rawKey).digest('hex')
}


// Short-lived cache to avoid duplicate DB lookups within the same request cycle
const keyCache = new Map<string, { result: Awaited<ReturnType<typeof lookupApiKey>>; ts: number }>()
const KEY_CACHE_TTL_MS = 5000

/**
 * Look up an API key by its hash. Uses admin DB (no RLS) since
 * we don't know the user yet. Cached briefly to avoid duplicate
 * lookups when auth + logging both need the key in the same request.
 */
export async function lookupApiKey(keyHash: string) {
  const cached = keyCache.get(keyHash)
  if (cached && Date.now() - cached.ts < KEY_CACHE_TTL_MS) {
    return cached.result
  }

  const rows = await withAdminDb(async (db) =>
    db
      .select()
      .from(apiKeys)
      .where(
        and(
          eq(apiKeys.keyHash, keyHash),
          eq(apiKeys.revoked, false)
        )
      )
      .limit(1)
  )

  const key = rows[0]
  if (!key || (key.expiresAt && new Date(key.expiresAt) < new Date())) {
    keyCache.set(keyHash, { result: null, ts: Date.now() })
    return null
  }

  keyCache.set(keyHash, { result: key, ts: Date.now() })
  return key
}

/**
 * Check if a request IP is allowed by the key's IP allowlist.
 * Returns true if allowedIps is null/empty (all IPs allowed).
 * Supports exact IP matching and basic CIDR notation.
 */
export function checkIpAllowed(allowedIps: string[] | null, requestIp: string | null): boolean {
  if (!allowedIps || allowedIps.length === 0) return true
  if (!requestIp) return false

  const normalizedIp = normalizeIp(requestIp)

  for (const allowed of allowedIps) {
    if (allowed.includes('/')) {
      // CIDR notation
      if (ipMatchesCidr(normalizedIp, allowed)) return true
    } else {
      // Exact match
      if (normalizeIp(allowed) === normalizedIp) return true
    }
  }

  return false
}

/** Fire-and-forget — caller should not await this */
export function recordApiKeyUsage(params: {
  apiKeyId: string
  userId: string
  endpoint: string
  method: string
  statusCode: number
  ipAddress: string | null
  userAgent: string | null
}): void {
  // Fire-and-forget
  withAdminDb(async (db) => {
    await db.insert(apiKeyUsageLogs).values({
      apiKeyId: params.apiKeyId,
      userId: params.userId,
      endpoint: params.endpoint,
      method: params.method,
      statusCode: params.statusCode,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    })

    await db
      .update(apiKeys)
      .set({
        lastUsedAt: new Date().toISOString(),
        requestCount: sql`${apiKeys.requestCount} + 1`,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(apiKeys.id, params.apiKeyId))
  }).catch((err) => {
    console.error('Failed to record API key usage:', err)
  })
}

function normalizeIp(ip: string): string {
  // Handle IPv4-mapped IPv6 (::ffff:127.0.0.1 -> 127.0.0.1)
  if (ip.startsWith('::ffff:')) {
    return ip.substring(7)
  }
  return ip
}

function ipMatchesCidr(ip: string, cidr: string): boolean {
  const [range, bitsStr] = cidr.split('/')
  const bits = parseInt(bitsStr, 10)
  if (isNaN(bits)) return false

  const normalizedRange = normalizeIp(range)

  // Only handle IPv4 CIDR for now
  const ipNum = ipToNumber(ip)
  const rangeNum = ipToNumber(normalizedRange)
  if (ipNum === null || rangeNum === null) return false

  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0
  return (ipNum & mask) === (rangeNum & mask)
}

function ipToNumber(ip: string): number | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  let num = 0
  for (const part of parts) {
    const octet = parseInt(part, 10)
    if (isNaN(octet) || octet < 0 || octet > 255) return null
    num = (num << 8) | octet
  }
  return num >>> 0
}
