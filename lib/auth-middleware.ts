/**
 * Lightweight auth check for Edge middleware.
 * This doesn't import the full auth config to avoid native module issues.
 * Full session validation happens in API routes.
 */

const BETTER_AUTH_COOKIE_NAME = "better-auth.session_token"

// Minimum length for a valid session token (prevents obviously invalid tokens)
const MIN_TOKEN_LENGTH = 32

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
  const sessionCookie = cookies.get(BETTER_AUTH_COOKIE_NAME)

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
