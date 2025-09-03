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

/**
 * Gets a cookie value by name
 */
export function getCookie(name: string): string | null {
  const encodedName = encodeURIComponent(name)
  const cookies = document.cookie.split('; ')
  
  for (const cookie of cookies) {
    const [cookieName, ...cookieValueParts] = cookie.split('=')
    if (cookieName === encodedName) {
      return decodeURIComponent(cookieValueParts.join('='))
    }
  }
  
  return null
}

/**
 * Deletes a cookie by setting it to expire in the past
 */
export function deleteCookie(name: string, options: Pick<CookieOptions, 'path' | 'domain'> = {}) {
  setSecureCookie(name, '', {
    ...options,
    maxAge: 0,
    expires: new Date(0)
  })
}