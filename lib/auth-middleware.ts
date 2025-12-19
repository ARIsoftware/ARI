/**
 * Lightweight auth check for Edge middleware.
 * This doesn't import the full auth config to avoid native module issues.
 * Full session validation happens in API routes.
 */

const BETTER_AUTH_COOKIE_NAME = "better-auth.session_token"

/**
 * Check if a session cookie exists.
 * This is a quick check for middleware - full validation happens server-side.
 */
export function hasSessionCookie(cookies: { get: (name: string) => { value: string } | undefined }): boolean {
  const sessionCookie = cookies.get(BETTER_AUTH_COOKIE_NAME)
  return !!sessionCookie?.value
}
