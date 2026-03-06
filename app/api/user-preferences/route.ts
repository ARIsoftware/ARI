import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { z } from 'zod'

// Validation schema for user preferences
const userPreferencesSchema = z.object({
  name: z.string().max(255).optional().nullable(),
  email: z.string().max(255).optional().nullable(),
  title: z.string().max(255).optional().nullable(),
  company_name: z.string().max(255).optional().nullable(),
  country: z.string().max(100).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  linkedin_url: z.string().max(500).optional().nullable(),
  timezone: z.string().max(50).optional(),
})

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) {
    const msg = (error as Record<string, unknown>).message
    return typeof msg === 'string' ? msg : JSON.stringify(msg)
  }
  return String(error)
}

/** Supabase REST API returns 404 for missing tables (not PostgreSQL 42P01) */
function isTableNotFound(status: number, errorCode?: string): boolean {
  return status === 404 || errorCode === '42P01'
}

const TABLE_MISSING_MSG = 'The user_preferences table does not exist. Please run the migration at /migrations/user_preferences.sql'

const DEFAULT_PREFS = (userId: string, email: string) => ({
  id: null,
  user_id: userId,
  name: null,
  email,
  title: null,
  company_name: null,
  country: null,
  city: null,
  linkedin_url: null,
  timezone: 'UTC',
})

export async function GET() {
  try {
    const { user, supabase } = await getAuthenticatedUser()

    if (!user || !supabase) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const result = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()

    if (result.error) {
      if (isTableNotFound(result.status, result.error.code)) {
        return NextResponse.json(DEFAULT_PREFS(user.id, user.email))
      }
      throw result.error
    }

    return NextResponse.json(result.data || DEFAULT_PREFS(user.id, user.email))
  } catch (error) {
    console.error('Failed to fetch user preferences:', error)
    return NextResponse.json(
      { error: 'Failed to fetch user preferences', message: getErrorMessage(error) },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { user, supabase } = await getAuthenticatedUser()

    if (!user || !supabase) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()

    const validationResult = userPreferencesSchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validationResult.error.errors },
        { status: 400 }
      )
    }

    const validatedData = validationResult.data

    const result = await supabase
      .from('user_preferences')
      .upsert(
        {
          user_id: user.id,
          ...validatedData,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )
      .select()

    if (result.error || isTableNotFound(result.status, result.error?.code)) {
      if (isTableNotFound(result.status, result.error?.code)) {
        return NextResponse.json(
          { error: 'Table not found', message: TABLE_MISSING_MSG },
          { status: 500 }
        )
      }
      return NextResponse.json(
        { error: 'Failed to save user preferences', message: result.error?.message || result.statusText || 'Unknown error' },
        { status: 500 }
      )
    }

    return NextResponse.json(result.data?.[0] ?? result.data)
  } catch (error) {
    console.error('Failed to save user preferences:', error)
    return NextResponse.json(
      { error: 'Failed to save user preferences', message: getErrorMessage(error) },
      { status: 500 }
    )
  }
}
