/**
 * Hello World Module - Data API Routes
 *
 * This file defines API endpoints for managing hello world entries.
 * It demonstrates:
 * - Authentication validation
 * - Zod schema validation
 * - Database operations with Supabase
 * - Error handling
 * - HTTP method handlers (GET, POST, DELETE)
 *
 * IMPORTANT: Module API routes follow Next.js App Router conventions
 * and are accessed via /api/modules/[module-id]/[...path]
 *
 * Endpoints:
 * - GET    /api/modules/hello-world/data       - List all entries
 * - POST   /api/modules/hello-world/data       - Create new entry
 * - DELETE /api/modules/hello-world/data?id=x  - Delete entry
 */

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseClient } from '@/lib/supabase-auth'
import { z } from 'zod'

/**
 * Validation Schema for POST requests
 * Uses Zod for runtime type validation
 */
const CreateEntrySchema = z.object({
  message: z.string()
    .min(1, 'Message is required')
    .max(500, 'Message must be less than 500 characters')
})

/**
 * GET Handler - Fetch all entries for the authenticated user
 *
 * Authentication: Required (Bearer token)
 * Query Params: None
 * Returns: { entries: HelloWorldEntry[] }
 */
export async function GET(request: NextRequest) {
  try {
    // Create Supabase client for this request
    const supabase = createSupabaseClient()

    // Validate authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized - Valid authentication required' },
        { status: 401 }
      )
    }

    // Query database
    // Note: RLS policies automatically filter by user_id
    const { data: entries, error: dbError } = await supabase
      .from('hello_world_entries')
      .select('*')
      .order('created_at', { ascending: false })

    if (dbError) {
      console.error('Database error:', dbError)
      return NextResponse.json(
        { error: 'Failed to fetch entries' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      entries: entries || [],
      count: entries?.length || 0
    })

  } catch (error) {
    console.error('GET /api/modules/hello-world/data error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST Handler - Create a new entry
 *
 * Authentication: Required (Bearer token)
 * Body: { message: string }
 * Returns: { entry: HelloWorldEntry }
 */
export async function POST(request: NextRequest) {
  try {
    // Create Supabase client for this request
    const supabase = createSupabaseClient()

    // Validate authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized - Valid authentication required' },
        { status: 401 }
      )
    }

    // Parse and validate request body
    const body = await request.json()
    const parseResult = CreateEntrySchema.safeParse(body)

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: parseResult.error.issues
        },
        { status: 400 }
      )
    }

    const { message } = parseResult.data

    // Insert into database
    // Note: RLS policies automatically set user_id
    const { data: entry, error: dbError } = await supabase
      .from('hello_world_entries')
      .insert({
        user_id: user.id,
        message: message
      })
      .select()
      .single()

    if (dbError) {
      console.error('Database error:', dbError)
      return NextResponse.json(
        { error: 'Failed to create entry' },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { entry },
      { status: 201 }
    )

  } catch (error) {
    console.error('POST /api/modules/hello-world/data error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * DELETE Handler - Delete an entry by ID
 *
 * Authentication: Required (Bearer token)
 * Query Params: id (UUID)
 * Returns: { success: boolean }
 */
export async function DELETE(request: NextRequest) {
  try {
    // Create Supabase client for this request
    const supabase = createSupabaseClient()

    // Validate authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized - Valid authentication required' },
        { status: 401 }
      )
    }

    // Get ID from query params
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { error: 'Missing required parameter: id' },
        { status: 400 }
      )
    }

    // Delete from database
    // Note: RLS policies ensure user can only delete their own entries
    const { error: dbError } = await supabase
      .from('hello_world_entries')
      .delete()
      .eq('id', id)

    if (dbError) {
      console.error('Database error:', dbError)
      return NextResponse.json(
        { error: 'Failed to delete entry' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Entry deleted successfully'
    })

  } catch (error) {
    console.error('DELETE /api/modules/hello-world/data error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * DEVELOPER NOTES:
 *
 * 1. Authentication:
 *    - ALWAYS validate authentication in module API routes
 *    - Use createSupabaseClient() from @/lib/supabase-auth
 *    - Check for user with getUser()
 *    - Return 401 if authentication fails
 *
 * 2. Input Validation:
 *    - Use Zod for runtime validation
 *    - Validate query params, body, and headers
 *    - Return 400 for validation errors
 *    - Include helpful error messages
 *
 * 3. Database Operations:
 *    - RLS policies automatically enforce user isolation
 *    - Always use Supabase client, never raw SQL
 *    - Handle database errors gracefully
 *    - Log errors for debugging
 *
 * 4. Error Handling:
 *    - Use try-catch for all handlers
 *    - Return appropriate HTTP status codes
 *    - Include error messages for debugging
 *    - Don't expose sensitive information
 *
 * 5. API Design:
 *    - Follow REST conventions
 *    - Use appropriate HTTP methods
 *    - Return consistent response formats
 *    - Document all endpoints
 *
 * 6. Testing:
 *    - Test with valid authentication
 *    - Test with invalid authentication
 *    - Test with invalid input
 *    - Test database error scenarios
 *
 * 7. Performance:
 *    - Use database indexes for queries
 *    - Limit result sets where appropriate
 *    - Consider caching for expensive operations
 *    - Monitor API response times
 */
