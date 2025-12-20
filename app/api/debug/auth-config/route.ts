import { NextResponse } from 'next/server'

/**
 * GET /api/debug/auth-config
 * Returns non-sensitive auth configuration details for debugging.
 * Does NOT expose secrets.
 */
export async function GET() {
  try {
    const isProduction = process.env.NODE_ENV === 'production'
    const appUrl = process.env.NEXT_PUBLIC_APP_URL

    // Check if secret is configured (don't expose the actual secret)
    const secretConfigured = !!(
      process.env.BETTER_AUTH_SECRET &&
      process.env.BETTER_AUTH_SECRET.length >= 32
    )

    // Check if database URL is configured
    const databaseConfigured = !!process.env.DATABASE_URL

    // Determine SSL status based on environment
    // In production, SSL should be enabled
    const sslEnabled = isProduction

    // Check if production origin is configured
    const hasProductionOrigin = !!appUrl && !appUrl.includes('localhost')

    // Rate limiting is enabled in our auth config
    const rateLimitEnabled = true // Hardcoded based on our auth.ts config

    // Check trusted origins
    const trustedOrigins: string[] = []
    if (appUrl) {
      trustedOrigins.push(appUrl)
    }
    if (!isProduction) {
      trustedOrigins.push('http://localhost:3000', 'http://localhost:3001')
    }

    return NextResponse.json({
      isProduction,
      secretConfigured,
      databaseConfigured,
      sslEnabled,
      hasProductionOrigin,
      rateLimitEnabled,
      trustedOriginsCount: trustedOrigins.length,
      environment: {
        NODE_ENV: process.env.NODE_ENV,
        NEXT_PUBLIC_APP_URL: appUrl ? 'Set' : 'Not set',
        DATABASE_URL: databaseConfigured ? 'Set' : 'Not set',
        BETTER_AUTH_SECRET: secretConfigured ? 'Set (32+ chars)' : 'Missing or too short',
      }
    })
  } catch (error) {
    console.error('Error getting auth config:', error)
    return NextResponse.json({ error: 'Failed to get auth config' }, { status: 500 })
  }
}
