// Secure cookie utilities

const isProduction = process.env.NODE_ENV === 'production'

interface CookieOptions {
  path?: string
  maxAge?: number
  expires?: Date
  domain?: string
  secure?: boolean
  sameSite?: 'strict' | 'lax' | 'none'
  httpOnly?: boolean
}

/**
 * Sets a cookie with secure defaults
 */
export function setSecureCookie(name: string, value: string, options: CookieOptions = {}) {
  const {
    path = '/',
    maxAge,
    expires,
    domain,
    secure = isProduction, // Only use secure in production (HTTPS)
    sameSite = 'lax', // Default to lax for good compatibility
    httpOnly = false
  } = options

  let cookieString = `${encodeURIComponent(name)}=${encodeURIComponent(value)}`

  if (path) cookieString += `; path=${path}`
  if (maxAge !== undefined) cookieString += `; max-age=${maxAge}`
  if (expires) cookieString += `; expires=${expires.toUTCString()}`
  if (domain) cookieString += `; domain=${domain}`
  if (secure) cookieString += `; secure`
  if (sameSite) cookieString += `; samesite=${sameSite}`
  if (httpOnly) cookieString += `; httponly`

  document.cookie = cookieString
}

