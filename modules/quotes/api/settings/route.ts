/**
 * Quotes Module - Settings API Routes
 *
 * This file defines API endpoints for managing module settings.
 *
 * Endpoints:
 * - GET /api/modules/quotes/settings  - Get user's settings
 * - PUT /api/modules/quotes/settings  - Update user's settings
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { z } from 'zod'

/**
 * Settings Schema
 * Validates the structure of settings being saved
 */
const SettingsSchema = z.object({
  showAuthor: z.boolean().optional(),
  cardsPerRow: z.number().min(1).max(4).optional(),
  defaultSortOrder: z.enum(['asc', 'desc']).optional()
})

/**
 * GET Handler - Fetch user's settings
 *
 * Authentication: Required
 * Returns: Settings object or empty object if no settings saved
 */
export async function GET(request: NextRequest) {
  try {
    const { user, supabase } = await getAuthenticatedUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Fetch settings from module_settings table
    const { data, error: dbError } = await supabase
      .from('module_settings')
      .select('settings')
      .eq('user_id', user.id)
      .eq('module_id', 'quotes')
      .single()

    // If no settings found, return empty object (client will use defaults)
    if (dbError && dbError.code === 'PGRST116') {
      return NextResponse.json({})
    }

    if (dbError) {
      console.error('Database error:', dbError)
      return NextResponse.json(
        { error: 'Failed to fetch settings' },
        { status: 500 }
      )
    }

    return NextResponse.json(data?.settings || {})

  } catch (error) {
    console.error('GET /api/modules/quotes/settings error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * PUT Handler - Update user's settings
 *
 * Authentication: Required
 * Body: Settings object (partial updates supported)
 * Returns: { success: boolean }
 */
export async function PUT(request: NextRequest) {
  try {
    const { user, supabase } = await getAuthenticatedUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Parse and validate body
    const body = await request.json()
    const parseResult = SettingsSchema.safeParse(body)

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: parseResult.error.issues
        },
        { status: 400 }
      )
    }

    // Upsert settings
    // Note: This will create a new row if one doesn't exist
    const { error: dbError } = await supabase
      .from('module_settings')
      .upsert({
        user_id: user.id,
        module_id: 'quotes',
        settings: parseResult.data,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,module_id'
      })

    if (dbError) {
      console.error('Database error:', dbError)
      return NextResponse.json(
        { error: 'Failed to save settings' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Settings saved successfully'
    })

  } catch (error) {
    console.error('PUT /api/modules/quotes/settings error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
