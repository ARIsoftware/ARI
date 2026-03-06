import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

// Create service role client
function getServiceSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY

  if (!supabaseUrl || !supabaseSecretKey) {
    throw new Error('Missing Supabase environment variables')
  }

  return createClient(supabaseUrl, supabaseSecretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

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

export async function GET() {
  try {
    const { user } = await getAuthenticatedUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServiceSupabase()

    // Fetch user preferences
    const { data: prefs, error } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (error && error.code !== 'PGRST116') {
      // PGRST116 is "no rows returned" - that's OK, return defaults
      if (error.code === '42P01') {
        // Table doesn't exist yet
        return NextResponse.json({
          id: null,
          user_id: user.id,
          name: null,
          email: user.email,
          title: null,
          company_name: null,
          country: null,
          city: null,
          linkedin_url: null,
          timezone: 'UTC',
        })
      }
      throw error
    }

    // Return preferences or defaults
    return NextResponse.json(prefs || {
      id: null,
      user_id: user.id,
      name: null,
      email: user.email,
      title: null,
      company_name: null,
      country: null,
      city: null,
      linkedin_url: null,
      timezone: 'UTC',
    })
  } catch (error) {
    console.error('Failed to fetch user preferences:', error)
    return NextResponse.json(
      { error: 'Failed to fetch user preferences' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { user } = await getAuthenticatedUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()

    // Validate the input
    const validationResult = userPreferencesSchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validationResult.error.errors },
        { status: 400 }
      )
    }

    const validatedData = validationResult.data

    const supabase = getServiceSupabase()

    // Check if preferences exist
    const { data: existing } = await supabase
      .from('user_preferences')
      .select('id')
      .eq('user_id', user.id)
      .single()

    const now = new Date().toISOString()

    if (existing) {
      // Update existing preferences
      const { data: updated, error } = await supabase
        .from('user_preferences')
        .update({
          ...validatedData,
          updated_at: now,
        })
        .eq('user_id', user.id)
        .select()
        .single()

      if (error) throw error
      return NextResponse.json(updated)
    } else {
      // Insert new preferences
      const { data: created, error } = await supabase
        .from('user_preferences')
        .insert({
          user_id: user.id,
          ...validatedData,
          created_at: now,
          updated_at: now,
        })
        .select()
        .single()

      if (error) throw error
      return NextResponse.json(created)
    }
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error)
    const errDetail = typeof error === 'object' && error !== null && 'details' in error ? (error as Record<string, unknown>).details : undefined
    console.error('Failed to save user preferences:', error)
    return NextResponse.json(
      { error: 'Failed to save user preferences', message: errMsg, details: errDetail },
      { status: 500 }
    )
  }
}
