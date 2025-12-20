import { hasSessionCookie } from "@/lib/auth-middleware"
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const protectedRoutes = [
  "/",
  "/tasks",
  "/dashboard",
  "/daily-fitness",
  "/add-task",
  "/add-fitness",
  "/edit-task",
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
  "/radar",
  "/debug",
  "/api" // All API routes require authentication (defense-in-depth)
]
const publicRoutes = ["/sign-in", "/auth", "/api/auth"]

export async function middleware(req: NextRequest) {
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

  const { pathname } = req.nextUrl

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
      // No session cookie - redirect to sign-in
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
