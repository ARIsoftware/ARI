import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, createErrorResponse } from '@/lib/api-helpers'
import { updateMajorProjectSchema, uuidParamSchema } from '@/lib/validation'
import { z } from 'zod'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Validate path parameter
    const paramValidation = uuidParamSchema.safeParse({ id: params.id })
    if (!paramValidation.success) {
      return createErrorResponse('Invalid project ID format', 400)
    }

    // Validate request body
    const validation = await validateRequestBody(request, updateMajorProjectSchema)
    if (!validation.success) {
      return validation.response
    }

    const updateData = validation.data
    const { user, supabase } = await getAuthenticatedUser()

    if (!user) {
      return createErrorResponse('Authentication required', 401)
    }

    // Clean and prepare update data
    const cleanedData: any = {
      updated_at: new Date().toISOString()
    }

    if (updateData.project_name !== undefined) {
      cleanedData.project_name = updateData.project_name.trim()
    }
    if (updateData.project_description !== undefined) {
      cleanedData.project_description = updateData.project_description?.trim() || null
    }
    if (updateData.project_due_date !== undefined) {
      cleanedData.project_due_date = updateData.project_due_date || null
    }

    // Explicit user filtering - only update user's own projects (defense-in-depth)
    const { data, error } = await supabase
      .from('major_projects')
      .update(cleanedData)
      .eq('id', params.id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) {
      console.error('Error updating major project:', error)
      return createErrorResponse(error.message, 500)
    }

    if (!data) {
      return createErrorResponse('Project not found or access denied', 404)
    }

    return NextResponse.json(data)
  } catch (error: any) {
    console.error('Error in PATCH /api/major-projects/[id]:', error)
    return createErrorResponse('Internal server error', 500)
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Validate path parameter
    const paramValidation = uuidParamSchema.safeParse({ id: params.id })
    if (!paramValidation.success) {
      return createErrorResponse('Invalid project ID format', 400)
    }

    const { user, supabase } = await getAuthenticatedUser()

    if (!user) {
      return createErrorResponse('Authentication required', 401)
    }

    // Explicit user filtering - only delete user's own projects (defense-in-depth)
    const { error } = await supabase
      .from('major_projects')
      .delete()
      .eq('id', params.id)
      .eq('user_id', user.id)

    if (error) {
      console.error('Error deleting major project:', error)
      return createErrorResponse(error.message, 500)
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error in DELETE /api/major-projects/[id]:', error)
    return createErrorResponse('Internal server error', 500)
  }
}
