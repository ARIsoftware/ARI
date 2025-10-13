/**
 * Hello World Module - Settings API Routes
 *
 * This file defines API endpoints for managing module settings.
 * It demonstrates:
 * - Settings persistence in module_settings table
 * - JSONB column usage for flexible settings
 * - GET and PUT patterns for settings
 *
 * Endpoints:
 * - GET /api/modules/hello-world/settings  - Get user's settings
 * - PUT /api/modules/hello-world/settings  - Update user's settings
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-auth'
import { z } from 'zod'

/**
 * Settings Schema
 * Validates the structure of settings being saved
 */
const SettingsSchema = z.object({
  enableNotifications: z.boolean().optional(),
  showInDashboard: z.boolean().optional(),
  defaultMessage: z.string().optional(),
  userDisplayName: z.string().optional(),
  theme: z.enum(['light', 'dark', 'auto']).optional(),
  refreshInterval: z.enum(['30', '60', '120']).optional()
})

/**
 * GET Handler - Fetch user's settings
 *
 * Authentication: Required
 * Returns: Settings object or empty object if no settings saved
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createClient()

    // Authenticate
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
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
      .eq('module_id', 'hello-world')
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
    console.error('GET /api/modules/hello-world/settings error:', error)
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
    const supabase = createClient()

    // Authenticate
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
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
        module_id: 'hello-world',
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
    console.error('PUT /api/modules/hello-world/settings error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * DEVELOPER NOTES:
 *
 * 1. Settings Storage:
 *    - Stored in module_settings table
 *    - settings column is JSONB (flexible schema)
 *    - Per-user settings (user_id + module_id unique constraint)
 *    - RLS policies enforce user isolation
 *
 * 2. Upsert Pattern:
 *    - Use upsert() with onConflict to create or update
 *    - Sets updated_at timestamp automatically
 *    - No need to check if row exists first
 *
 * 3. Settings Schema:
 *    - Define Zod schema for validation
 *    - All fields optional (partial updates supported)
 *    - Client provides default values for missing fields
 *
 * 4. Error Handling:
 *    - PGRST116 = not found (expected for new users)
 *    - Return empty object on not found
 *    - Log other database errors
 *    - Return 500 for unexpected errors
 *
 * 5. Best Practices:
 *    - Keep settings lightweight (< 100KB)
 *    - Don't store sensitive data in settings
 *    - Validate all input with Zod
 *    - Consider versioning for schema changes
 */
