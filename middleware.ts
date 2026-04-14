import { hasSessionCookie, hasApiKeyHeader } from "@/lib/auth-middleware"
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
// Import the generated module manifest to get public routes
// This is regenerated on build/dev via generate-module-registry script
import moduleManifest from '@/lib/generated/module-manifest.json'

const isSetupComplete = !!process.env.DATABASE_URL && !!process.env.BETTER_AUTH_SECRET
const isDev = process.env.NODE_ENV !== 'production'

// Content Security Policy — computed once at startup
const cspHeader = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''} https://js.pusher.com https://stats.pusher.com https://sockjs-us3.pusher.com https://www.youtube.com https://youtube.com`,
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: https: blob:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://js.pusher.com https://sockjs-us3.pusher.com wss://ws-us3.pusher.com",
  "frame-src 'self' https://www.youtube.com https://youtube.com",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "media-src 'self'"
].join("; ")

/** Apply all security headers to any response (redirects, errors, etc.) */
function withSecurityHeaders(res: NextResponse): NextResponse {
  res.headers.set("X-Robots-Tag", "noindex, nofollow")
  res.headers.set("Content-Security-Policy", cspHeader)
  res.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload")
  res.headers.set("X-Frame-Options", "DENY")
  res.headers.set("X-Content-Type-Options", "nosniff")
  res.headers.set("X-XSS-Protection", "1; mode=block")
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin")
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
  return res
}

const protectedRoutes = [
  "/",
  "/tasks",
  "/dashboard",
  "/daily-fitness",
  "/add-fitness",
  "/edit-fitness",
  "/northstar",
  "/winter-arc",
  "/major-projects",
  "/contacts",
  "/hyrox",
  "/shipments",
  "/motivation",
  "/assist",
  "/backups",
  "/backups.old",
  "/tests",
  "/settings",
  "/modules",
  "/profile",
  "/logs",
  "/debug",
  "/api" // All API routes require authentication (defense-in-depth)
]

// Static public routes that the manifest cannot describe:
//   /sign-in, /auth, /database-error — UI pages (not API routes)
//   /api/auth — Better Auth's catch-all (owned by Better Auth, can't be tagged)
const staticPublicRoutes = ["/sign-in", "/auth", "/api/auth", "/database-error", "/welcome", "/robots.txt"]

// All other public API routes are sourced from the manifest. Both module
// routes (declared in module.json) and core routes (declared via
// `export const isPublic = true`) flow through manifest.publicRoutes — see
// scripts/generate-module-registry.js.
const modulePublicRoutes: string[] = (moduleManifest.publicRoutes || []).map(
  (route: { fullPath: string }) => route.fullPath
)

const publicRoutes = [...staticPublicRoutes, ...modulePublicRoutes]

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // SETUP MODE: If DATABASE_URL is not configured, redirect to welcome wizard
  // Only allow /welcome and /api/auth (for post-setup login)
  if (!isSetupComplete) {
    const setupApiRoutes = ["/api/download-env", "/api/project-dir"]
    const isSetupAllowed = pathname === "/welcome" ||
                           pathname.startsWith("/welcome/") ||
                           pathname.startsWith("/api/auth") ||
                           setupApiRoutes.includes(pathname)

    if (!isSetupAllowed) {
      return withSecurityHeaders(NextResponse.redirect(new URL("/welcome", req.url)))
    }

    return withSecurityHeaders(NextResponse.next({ request: req }))
  }

  // IP/HOSTNAME ALLOWLIST: Restrict access if ALLOWED_IPS is configured
  const allowedIpsEnv = process.env.ALLOWED_IPS?.trim()
  if (allowedIpsEnv) {
    const entries = allowedIpsEnv.split(',').map(e => e.trim()).filter(Boolean)
    const allowedIPs = new Set(entries.filter(e => /^[\d.:a-fA-F]+$/.test(e)))
    const allowedHostnames = new Set(entries.filter(e => !/^[\d.:a-fA-F]+$/.test(e)))

    // Always allow loopback
    allowedIPs.add('127.0.0.1')
    allowedIPs.add('::1')
    allowedHostnames.add('localhost')

    // Determine client IP
    const clientIP =
      req.headers.get('cf-connecting-ip') ||
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip')

    // Get hostname from Host header (strip port)
    const host = req.headers.get('host')?.split(':')[0] || ''

    if (clientIP) {
      const ipAllowed = allowedIPs.has(clientIP)
      const hostAllowed = allowedHostnames.has(host)

      if (!ipAllowed && !hostAllowed) {
        return withSecurityHeaders(new NextResponse('Access Denied - IP Address Not Authorized in ALLOWED_IPS.', {
          status: 403,
        }))
      }
    }
    // If no client IP header found, allow (likely direct/localhost access)
  }

  // Block sign-up endpoint — only server-side bootstrap can create accounts
  if (pathname.startsWith('/api/auth/sign-up')) {
    return withSecurityHeaders(new NextResponse(JSON.stringify({ error: 'Sign-up is disabled' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    }))
  }

  // NORMAL MODE: Setup complete, existing auth logic below
  const response = withSecurityHeaders(NextResponse.next({ request: req }))

  // Allow public routes without any auth checks
  if (publicRoutes.some(route => pathname.startsWith(route))) {
    return response
  }

  // Check authentication for protected routes
  const isProtectedRoute = protectedRoutes.some(route => pathname.startsWith(route))

  if (isProtectedRoute) {
    // Quick check: does a session cookie exist?
    // Full session validation happens in API routes/server components
    const hasSession = hasSessionCookie(req.cookies)

    if (!hasSession) {
      // For API routes, check for API key header as alternative auth
      if (pathname.startsWith('/api')) {
        if (hasApiKeyHeader(req.headers)) {
          // Format looks valid — let request through for full validation
          // in getAuthenticatedUser()
          return response
        }
        // No session cookie and no valid API key header
        return withSecurityHeaders(NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        ))
      }
      // For page routes, redirect to sign-in
      return withSecurityHeaders(NextResponse.redirect(new URL('/sign-in', req.url)))
    }

    // Session cookie exists - allow request to proceed
    // Full validation will happen in the actual route/API
    // Note: Feature flag checking removed for now - can be re-added via API call
  }

  return response
}

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
}
