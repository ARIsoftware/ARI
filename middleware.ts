import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const protectedRoutes = ["/", "/tasks", "/dashboard", "/daily-fitness", "/add-task", "/add-fitness", "/edit-task", "/edit-fitness", "/northstar", "/contacts", "/hyrox", "/shipments"]
const publicRoutes = ["/sign-in", "/auth"]

export async function middleware(req: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request: req,
  })

  // Add comprehensive security headers
  supabaseResponse.headers.set("X-Robots-Tag", "noindex, nofollow")
  
  // Content Security Policy
  supabaseResponse.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.pusher.com https://stats.pusher.com https://sockjs-us3.pusher.com https://www.youtube.com https://youtube.com",
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
  supabaseResponse.headers.set(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains; preload"
  )
  
  // X-Frame-Options
  supabaseResponse.headers.set("X-Frame-Options", "DENY")
  
  // X-Content-Type-Options
  supabaseResponse.headers.set("X-Content-Type-Options", "nosniff")
  
  // X-XSS-Protection
  supabaseResponse.headers.set("X-XSS-Protection", "1; mode=block")
  
  // Referrer-Policy
  supabaseResponse.headers.set("Referrer-Policy", "strict-origin-when-cross-origin")
  
  // Permissions-Policy
  supabaseResponse.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()"
  )

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request: req,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session if expired - required for Server Components
  const { data: { session } } = await supabase.auth.getSession()

  const { pathname } = req.nextUrl
  
  // Allow public routes
  if (publicRoutes.some(route => pathname.startsWith(route))) {
    return supabaseResponse
  }

  // Check authentication for protected routes
  const isProtectedRoute = protectedRoutes.some(route => pathname.startsWith(route))
  
  if (isProtectedRoute && !session) {
    return NextResponse.redirect(new URL('/sign-in', req.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
}
