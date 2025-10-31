import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, createErrorResponse } from '@/lib/api-helpers'
import { createMajorProjectSchema } from '@/lib/validation'

export async function GET(request: NextRequest) {
  try {
    const { user, supabase } = await getAuthenticatedUser()

    if (!user) {
      return createErrorResponse('Authentication required', 401)
    }

    // Explicit user filtering for defense-in-depth (RLS also enforces this)
    const { data, error } = await supabase
      .from('major_projects')
      .select('*')
      .eq('user_id', user.id)
      .order('project_due_date', { ascending: true, nullsFirst: false })

    if (error) {
      console.error('Error fetching major projects:', error)
      return createErrorResponse(error.message, 500)
    }

    return NextResponse.json(data)
  } catch (error: any) {
    console.error('Error in GET /api/major-projects:', error)
    return createErrorResponse('Internal server error', 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    // Validate request body
    const validation = await validateRequestBody(request, createMajorProjectSchema)
    if (!validation.success) {
      return validation.response
    }

    const { project_name, project_description, project_due_date } = validation.data
    const { user, supabase } = await getAuthenticatedUser()

    if (!user) {
      return createErrorResponse('Authentication required', 401)
    }

    // Explicit user_id assignment for defense-in-depth
    const { data, error } = await supabase
      .from('major_projects')
      .insert({
        user_id: user.id,
        project_name: project_name.trim(),
        project_description: project_description?.trim() || null,
        project_due_date: project_due_date || null,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating major project:', error)
      return createErrorResponse(error.message, 500)
    }

    return NextResponse.json(data, { status: 201 })
  } catch (error: any) {
    console.error('Error in POST /api/major-projects:', error)
    return createErrorResponse('Internal server error', 500)
  }
}
