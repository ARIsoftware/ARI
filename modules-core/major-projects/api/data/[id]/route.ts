/**
 * Major Projects API - Individual Project Endpoints
 *
 * This file handles PATCH (update) and DELETE operations for individual projects.
 *
 * Authentication: All endpoints require a valid authenticated session
 * Base path: /api/modules/major-projects/data/[id]
 *
 * Endpoints:
 * - PATCH: Update an existing project
 * - DELETE: Delete a project
 *
 * @module major-projects/api/data/[id]
 * @version 1.0.0
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, createErrorResponse, toSnakeCase } from '@/lib/api-helpers'
import { z } from 'zod'
import { majorProjects } from '@/lib/db/schema'
import { eq, sql } from 'drizzle-orm'
import type { MajorProject, UpdateProjectResponse, DeleteProjectResponse } from '../../../types'

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

/**
 * Helper for non-empty strings (reused from validation.ts pattern)
 */
const nonEmptyString = z.string().trim().min(1, 'Field is required')

/**
 * Validation schema for updating a project
 * All fields are optional, but at least one must be provided
 */
export const updateMajorProjectSchema = z.object({
  project_name: nonEmptyString.max(255, 'Project name too long').optional(),
  project_description: z.string().max(2000, 'Description too long').nullable().optional(),
  project_due_date: z.union([
    z.string().datetime(),
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
    z.null()
  ]).optional()
}).refine(
  (data) => Object.keys(data).length > 0,
  {
    message: 'At least one field must be provided for update'
  }
)

/**
 * Validation schema for UUID path parameters
 */
export const uuidParamSchema = z.object({
  id: z.string().uuid('Invalid UUID format')
})

// ============================================================================
// PATCH HANDLER - Update project
// ============================================================================

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Await params (Next.js 15 requirement)
    const { id } = await params

    // Validate path parameter (UUID format)
    const paramValidation = uuidParamSchema.safeParse({ id })
    if (!paramValidation.success) {
      return createErrorResponse('Invalid project ID format', 400)
    }

    // Validate request body
    const validation = await validateRequestBody(request, updateMajorProjectSchema)
    if (!validation.success) {
      return validation.response
    }

    const updateData = validation.data

    // Authenticate user
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return createErrorResponse('Authentication required', 401)
    }

    // Build update object with cleaned data
    const cleanedData: Record<string, unknown> = {
      updatedAt: sql`timezone('utc'::text, now())`
    }

    if (updateData.project_name !== undefined) {
      cleanedData.projectName = updateData.project_name.trim()
    }
    if (updateData.project_description !== undefined) {
      cleanedData.projectDescription = updateData.project_description?.trim() || null
    }
    if (updateData.project_due_date !== undefined) {
      cleanedData.projectDueDate = updateData.project_due_date || null
    }

    // RLS automatically ensures user can only update their own projects
    const data = await withRLS((db) =>
      db.update(majorProjects)
        .set(cleanedData)
        .where(eq(majorProjects.id, id))
        .returning()
    )

    if (data.length === 0) {
      return createErrorResponse('Project not found or access denied', 404)
    }

    return NextResponse.json(toSnakeCase(data[0]))

  } catch (error: any) {
    console.error('[MajorProjects] Error in PATCH /api/modules/major-projects/data/[id]:', error)
    return createErrorResponse('Internal server error', 500)
  }
}

// ============================================================================
// DELETE HANDLER - Delete project
// ============================================================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Await params (Next.js 15 requirement)
    const { id } = await params

    // Validate path parameter (UUID format)
    const paramValidation = uuidParamSchema.safeParse({ id })
    if (!paramValidation.success) {
      return createErrorResponse('Invalid project ID format', 400)
    }

    // Authenticate user
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return createErrorResponse('Authentication required', 401)
    }

    // RLS automatically ensures user can only delete their own projects
    await withRLS((db) =>
      db.delete(majorProjects).where(eq(majorProjects.id, id))
    )

    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error('[MajorProjects] Error in DELETE /api/modules/major-projects/data/[id]:', error)
    return createErrorResponse('Internal server error', 500)
  }
}
