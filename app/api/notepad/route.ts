import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { createErrorResponse } from '@/lib/api-helpers'

const MAX_CONTENT_LENGTH = 2250

export async function GET(request: NextRequest) {
  try {
    const { user, supabase } = await getAuthenticatedUser()

    if (!user) {
      return createErrorResponse('Authentication required', 401)
    }

    const { data, error } = await supabase
      .from("notepad")
      .select("content, updated_at")
      .eq("user_id", user.id)
      .single()

    if (error) {
      // If no notepad exists yet, return empty content
      if (error.code === 'PGRST116') {
        return NextResponse.json({ content: "", updated_at: null })
      }
      console.error('Error fetching notepad:', error)
      return createErrorResponse(error.message, 500)
    }

    return NextResponse.json(data)
  } catch (err) {
    console.error('API error:', err)
    return createErrorResponse('Internal server error', 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, supabase } = await getAuthenticatedUser()

    if (!user) {
      return createErrorResponse('Authentication required', 401)
    }

    const body = await request.json()
    const { content } = body

    // Validate content length
    if (!content || typeof content !== 'string') {
      return createErrorResponse('Content is required', 400)
    }

    if (content.length > MAX_CONTENT_LENGTH) {
      return createErrorResponse(`Content exceeds maximum length of ${MAX_CONTENT_LENGTH} characters`, 400)
    }

    // Try to update existing notepad first
    const { data: existingData, error: fetchError } = await supabase
      .from("notepad")
      .select("id")
      .eq("user_id", user.id)
      .single()

    let data, error

    if (existingData) {
      // Update existing notepad
      const result = await supabase
        .from("notepad")
        .update({ content })
        .eq("user_id", user.id)
        .select()
        .single()

      data = result.data
      error = result.error
    } else {
      // Create new notepad
      const result = await supabase
        .from("notepad")
        .insert([{ content, user_id: user.id }])
        .select()
        .single()

      data = result.data
      error = result.error
    }

    if (error) {
      console.error('Error saving notepad:', error)
      return createErrorResponse(error.message, 500)
    }

    return NextResponse.json(data)
  } catch (err) {
    console.error('API error:', err)
    return createErrorResponse('Internal server error', 500)
  }
}