import { hasSessionCookie } from "@/lib/auth-middleware"
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
// Import the generated module manifest to get public routes
// This is regenerated on build/dev via generate-module-registry script
import moduleManifest from '@/lib/generated/module-manifest.json'

// Check if setup is complete (DATABASE_URL configured)
const isSetupComplete = !!process.env.DATABASE_URL

const protectedRoutes = [
  "/",
  "/welcome",  // Protected when setup is complete (requires auth to rerun wizard)
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

// Static public routes (non-module)
const staticPublicRoutes = ["/sign-in", "/auth", "/api/auth"]

// Get dynamic public routes from module manifest
// These are module API routes that have publicRoutes configured in module.json
const modulePublicRoutes: string[] = (moduleManifest.publicRoutes || []).map(
  (route: { fullPath: string }) => route.fullPath
)

// Combine static and dynamic public routes
const publicRoutes = [...staticPublicRoutes, ...modulePublicRoutes]

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // SETUP MODE: If DATABASE_URL is not configured, redirect to welcome wizard
  // Only allow /welcome and /api/auth (for post-setup login)
  if (!isSetupComplete) {
    const isSetupAllowed = pathname === "/welcome" ||
                           pathname.startsWith("/welcome/") ||
                           pathname.startsWith("/api/auth")

    if (!isSetupAllowed) {
      return NextResponse.redirect(new URL("/welcome", req.url))
    }

    // Allow setup routes without auth - just add security headers
    const setupResponse = NextResponse.next({ request: req })
    setupResponse.headers.set("X-Robots-Tag", "noindex, nofollow")
    setupResponse.headers.set("X-Frame-Options", "DENY")
    setupResponse.headers.set("X-Content-Type-Options", "nosniff")
    setupResponse.headers.set("X-XSS-Protection", "1; mode=block")
    setupResponse.headers.set("Referrer-Policy", "strict-origin-when-cross-origin")
    return setupResponse
  }

  // NORMAL MODE: Setup complete, existing auth logic below
  let response = NextResponse.next({
    request: req,
  })

  // Add comprehensive security headers
  response.headers.set("X-Robots-Tag", "noindex, nofollow")

  // Content Security Policy
  response.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.pusher.com https://stats.pusher.com https://sockjs-us3.pusher.com https://www.youtube.com https://youtube.com",
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
  )

  // HTTP Strict Transport Security
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains; preload"
  )

  // X-Frame-Options
  response.headers.set("X-Frame-Options", "DENY")

  // X-Content-Type-Options
  response.headers.set("X-Content-Type-Options", "nosniff")

  // X-XSS-Protection
  response.headers.set("X-XSS-Protection", "1; mode=block")

  // Referrer-Policy
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin")

  // Permissions-Policy
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()"
  )

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
      // For API routes, return JSON 401 instead of redirecting to HTML page
      // This prevents "Unexpected token '<'" errors when client fetches expect JSON
      if (pathname.startsWith('/api')) {
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        )
      }
      // For page routes, redirect to sign-in
      return NextResponse.redirect(new URL('/sign-in', req.url))
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
