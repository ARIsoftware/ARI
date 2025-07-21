import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"

const isProtectedRoute = createRouteMatcher(["/", "/tasks(.*)", "/dashboard(.*)"])

export default clerkMiddleware(async (auth, req) => {
  // Add X-Robots-Tag header to prevent indexing
  const response = NextResponse.next()
  response.headers.set("X-Robots-Tag", "noindex, nofollow")

  // Only protect routes if Clerk is properly configured
  if (
    isProtectedRoute(req) &&
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY !== "pk_test_placeholder"
  ) {
    try {
      await auth.protect()
    } catch (error) {
      console.log("Auth protection skipped - Clerk not configured")
    }
  }

  return response
})

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
}
