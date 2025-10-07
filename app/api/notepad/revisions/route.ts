import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { createErrorResponse } from '@/lib/api-helpers'

export async function GET(request: NextRequest) {
  try {
    const { user, supabase } = await getAuthenticatedUser()

    if (!user) {
      return createErrorResponse('Authentication required', 401)
    }

    // Fetch all revisions for this user, ordered by revision number descending
    const { data, error } = await supabase
      .from("notepad_revisions")
      .select("id, content, created_at, revision_number")
      .eq("user_id", user.id)
      .order("revision_number", { ascending: false })

    if (error) {
      console.error('Error fetching notepad revisions:', error)
      return createErrorResponse(error.message, 500)
    }

    return NextResponse.json(data || [])
  } catch (err) {
    console.error('API error:', err)
    return createErrorResponse('Internal server error', 500)
  }
}

// POST endpoint to restore a specific revision
export async function POST(request: NextRequest) {
  try {
    const { user, supabase } = await getAuthenticatedUser()

    if (!user) {
      return createErrorResponse('Authentication required', 401)
    }

    const body = await request.json()
    const { revision_id } = body

    if (!revision_id) {
      return createErrorResponse('revision_id is required', 400)
    }

    // Fetch the specific revision
    const { data: revision, error: fetchError } = await supabase
      .from("notepad_revisions")
      .select("content, revision_number")
      .eq("id", revision_id)
      .eq("user_id", user.id) // Ensure user owns this revision
      .single()

    if (fetchError || !revision) {
      console.error('Error fetching revision:', fetchError)
      return createErrorResponse('Revision not found', 404)
    }

    // Get the next revision number
    const { data: revisionData, error: revisionError } = await supabase
      .rpc('get_next_revision_number', { p_user_id: user.id })

    if (revisionError) {
      console.error('Error getting revision number:', revisionError)
      return createErrorResponse(revisionError.message, 500)
    }

    const newRevisionNumber = revisionData as number

    // Create a new revision with the restored content
    const { data: newRevision, error: insertError } = await supabase
      .from("notepad_revisions")
      .insert([{
        content: revision.content,
        user_id: user.id,
        revision_number: newRevisionNumber
      }])
      .select()
      .single()

    if (insertError) {
      console.error('Error creating restored revision:', insertError)
      return createErrorResponse(insertError.message, 500)
    }

    // Update the main notepad table
    const { data: existingData } = await supabase
      .from("notepad")
      .select("id")
      .eq("user_id", user.id)
      .single()

    if (existingData) {
      await supabase
        .from("notepad")
        .update({ content: revision.content })
        .eq("user_id", user.id)
    } else {
      await supabase
        .from("notepad")
        .insert([{ content: revision.content, user_id: user.id }])
    }

    return NextResponse.json(newRevision)
  } catch (err) {
    console.error('API error:', err)
    return createErrorResponse('Internal server error', 500)
  }
}
