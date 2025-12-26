/**
 * Major Projects API - Data Endpoints
 *
 * This file handles GET (list) and POST (create) operations for major projects.
 *
 * Authentication: All endpoints require a valid authenticated session
 * Base path: /api/modules/major-projects/data
 *
 * Endpoints:
 * - GET: Fetch all projects for authenticated user
 * - POST: Create a new project
 *
 * @module major-projects/api/data
 * @version 1.0.0
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, createErrorResponse, toSnakeCase } from '@/lib/api-helpers'
import { z } from 'zod'
import { majorProjects } from '@/lib/db/schema'
import { asc } from 'drizzle-orm'
import type { MajorProject, CreateProjectResponse, GetProjectsResponse } from '../../types'

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

/**
 * Helper for non-empty strings (reused from validation.ts pattern)
 */
const nonEmptyString = z.string().trim().min(1, 'Field is required')

/**
 * Validation schema for creating a new project
 * - project_name: Required, 1-255 characters
 * - project_description: Optional, max 2000 characters
 * - project_due_date: Optional, ISO datetime or YYYY-MM-DD format
 */
export const createMajorProjectSchema = z.object({
  project_name: nonEmptyString.max(255, 'Project name too long'),
  project_description: z.string().max(2000, 'Description too long').nullable().optional(),
  project_due_date: z.union([
    z.string().datetime(),
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
    z.null()
  ]).optional()
})

// ============================================================================
// GET HANDLER - Fetch all projects
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return createErrorResponse('Authentication required', 401)
    }

    // RLS automatically filters by user_id
    // Order by due date: nulls last, ascending otherwise
    const data = await withRLS((db) =>
      db.select()
        .from(majorProjects)
        .orderBy(asc(majorProjects.projectDueDate))
    )

    return NextResponse.json(toSnakeCase(data) || [])

  } catch (error: any) {
    console.error('[MajorProjects] Error in GET /api/modules/major-projects/data:', error)
    return createErrorResponse('Internal server error', 500)
  }
}

// ============================================================================
// POST HANDLER - Create new project
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    // Step 1: Validate request body
    const validation = await validateRequestBody(request, createMajorProjectSchema)
    if (!validation.success) {
      return validation.response
    }

    const { project_name, project_description, project_due_date } = validation.data

    // Step 2: Authenticate user
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return createErrorResponse('Authentication required', 401)
    }

    // Step 3: INSERT requires explicit user_id
    const data = await withRLS((db) =>
      db.insert(majorProjects)
        .values({
          userId: user.id,
          projectName: project_name.trim(),
          projectDescription: project_description?.trim() || null,
          projectDueDate: project_due_date || null,
        })
        .returning()
    )

    // Step 4: Return created project with 201 status
    return NextResponse.json(toSnakeCase(data[0]), { status: 201 })

  } catch (error: any) {
    console.error('[MajorProjects] Error in POST /api/modules/major-projects/data:', error)
    return createErrorResponse('Internal server error', 500)
  }
}
