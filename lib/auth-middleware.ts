/**
 * Lightweight auth check for Edge middleware.
 * This doesn't import the full auth config to avoid native module issues.
 * Full session validation happens in API routes.
 */

const BETTER_AUTH_COOKIE_NAME = "better-auth.session_token"
const SECURE_COOKIE_NAME = `__Secure-${BETTER_AUTH_COOKIE_NAME}`
const isProduction = process.env.NODE_ENV === 'production'

// Minimum length for a valid session token (prevents obviously invalid tokens)
const MIN_TOKEN_LENGTH = 32

// API key format: ari_k_ + 64 hex chars = 70 chars minimum
const API_KEY_PREFIX = "ari_k_"
const MIN_API_KEY_LENGTH = 38

/**
 * Check if a session cookie exists and has valid format.
 * This is a quick check for middleware - full validation happens server-side.
 *
 * Validates:
 * - Cookie exists
 * - Cookie value is non-empty
 * - Cookie value meets minimum length requirement
 * - Cookie value doesn't contain obvious injection attempts
 */
export function hasSessionCookie(cookies: { get: (name: string) => { value: string } | undefined }): boolean {
  // __Secure- cookies require HTTPS, so browsers never send them in dev (HTTP)
  const sessionCookie = isProduction
    ? cookies.get(SECURE_COOKIE_NAME)
    : cookies.get(BETTER_AUTH_COOKIE_NAME)

  if (!sessionCookie?.value) {
    return false
  }

  const token = sessionCookie.value

  // Basic format validation
  if (token.length < MIN_TOKEN_LENGTH) {
    return false
  }

  // Check for obvious injection attempts (null bytes, newlines)
  if (token.includes('\0') || token.includes('\n') || token.includes('\r')) {
    return false
  }

  return true
}

/**
 * Check if the request has a valid-format API key header.
 * Lightweight format check only — full validation (hash lookup, expiry, IP)
 * happens in getAuthenticatedUser().
 */
export function hasApiKeyHeader(headers: { get: (name: string) => string | null }): boolean {
  const apiKey = headers.get('x-api-key')
  if (!apiKey) return false
  return apiKey.startsWith(API_KEY_PREFIX) && apiKey.length >= MIN_API_KEY_LENGTH
}
