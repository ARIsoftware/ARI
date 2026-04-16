import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { safeErrorResponse } from '@/lib/api-error'

export const debugRole = "test-connection"

export async function GET() {
  // Require authentication for this diagnostic endpoint
  const { user } = await getAuthenticatedUser()

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({
      success: false,
      error: 'Missing environment variables'
    })
  }

  try {
    // Test if we can reach Supabase
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)

    const response = await fetch(`${supabaseUrl}/rest/v1/`, {
      method: 'GET',
      headers: {
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${supabaseAnonKey}`,
      },
      signal: controller.signal
    })

    clearTimeout(timeoutId)

    return NextResponse.json({
      success: true,
      status: response.status,
      statusText: response.statusText,
      url: supabaseUrl.substring(0, 30) + '...'
    })
  } catch (error: unknown) {
    return NextResponse.json({
      success: false,
      error: safeErrorResponse(error),
    })
  }
}
