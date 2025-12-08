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
import { validateRequestBody, createErrorResponse } from '@/lib/api-helpers'
import { z } from 'zod'
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

/**
 * GET Handler - Fetch all projects for the authenticated user
 *
 * Authentication: Required (Bearer token)
 * Query Params: None
 * Returns: Array of MajorProject objects ordered by due date
 *
 * Security:
 * - Validates authentication via getAuthenticatedUser()
 * - RLS automatically filters by user_id
 * - Defense-in-depth: Explicit user_id filter
 *
 * @param request - Next.js request object
 * @returns JSON array of projects or error response
 *
 * @example
 * ```
 * GET /api/modules/major-projects/data
 * Authorization: Bearer <token>
 *
 * Response: [
 *   {
 *     "id": "uuid",
 *     "user_id": "uuid",
 *     "project_name": "Website Redesign",
 *     "project_description": "Complete overhaul",
 *     "project_due_date": "2025-12-31",
 *     "created_at": "2025-01-01T00:00:00.000Z",
 *     "updated_at": "2025-01-01T00:00:00.000Z"
 *   }
 * ]
 * ```
 */
export async function GET(request: NextRequest) {
  try {
    // Step 1: Authenticate user
    const { user, supabase } = await getAuthenticatedUser()

    if (!user) {
      return createErrorResponse('Authentication required', 401)
    }

    // Step 2: Fetch projects from database
    // Defense-in-depth: Explicit user filtering (RLS also enforces this)
    // Order by due date: null dates last, ascending otherwise
    const { data, error } = await supabase
      .from('major_projects')
      .select('*')
      .eq('user_id', user.id)
      .order('project_due_date', { ascending: true, nullsFirst: false })

    // Step 3: Handle database errors
    if (error) {
      console.error('[MajorProjects] Error fetching projects:', error)
      return createErrorResponse(error.message, 500)
    }

    // Step 4: Return successful response
    return NextResponse.json(data || [])

  } catch (error: any) {
    console.error('[MajorProjects] Error in GET /api/modules/major-projects/data:', error)
    return createErrorResponse('Internal server error', 500)
  }
}

// ============================================================================
// POST HANDLER - Create new project
// ============================================================================

/**
 * POST Handler - Create a new project
 *
 * Authentication: Required (Bearer token)
 * Body: { project_name, project_description?, project_due_date? }
 * Returns: Created project with HTTP 201 status
 *
 * Validation:
 * - project_name: Required, 1-255 characters
 * - project_description: Optional, max 2000 characters
 * - project_due_date: Optional, ISO datetime or YYYY-MM-DD
 *
 * Security:
 * - Validates authentication
 * - Validates input with Zod schema
 * - user_id set from authenticated session (not from request body)
 * - RLS enforces user can only insert their own data
 *
 * @param request - Next.js request object with JSON body
 * @returns Created project object or error response
 *
 * @example
 * ```
 * POST /api/modules/major-projects/data
 * Authorization: Bearer <token>
 * Content-Type: application/json
 *
 * Body:
 * {
 *   "project_name": "Q1 Marketing Campaign",
 *   "project_description": "Launch new product line",
 *   "project_due_date": "2025-03-31"
 * }
 *
 * Response (201 Created):
 * {
 *   "id": "new-uuid",
 *   "user_id": "user-uuid",
 *   "project_name": "Q1 Marketing Campaign",
 *   "project_description": "Launch new product line",
 *   "project_due_date": "2025-03-31",
 *   "created_at": "2025-01-01T00:00:00.000Z",
 *   "updated_at": "2025-01-01T00:00:00.000Z"
 * }
 * ```
 */
export async function POST(request: NextRequest) {
  try {
    // Step 1: Validate request body
    const validation = await validateRequestBody(request, createMajorProjectSchema)
    if (!validation.success) {
      return validation.response
    }

    const { project_name, project_description, project_due_date } = validation.data

    // Step 2: Authenticate user
    const { user, supabase } = await getAuthenticatedUser()

    if (!user) {
      return createErrorResponse('Authentication required', 401)
    }

    // Step 3: Insert new project into database
    // SECURITY: user_id is set from authenticated session, NOT from request body
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

    // Step 4: Handle database errors
    if (error) {
      console.error('[MajorProjects] Error creating project:', error)
      return createErrorResponse(error.message, 500)
    }

    // Step 5: Return created project with 201 status
    return NextResponse.json(data, { status: 201 })

  } catch (error: any) {
    console.error('[MajorProjects] Error in POST /api/modules/major-projects/data:', error)
    return createErrorResponse('Internal server error', 500)
  }
}

// ============================================================================
// DEVELOPER NOTES
// ============================================================================

/**
 * Why separate GET/POST from PATCH/DELETE?
 *
 * This follows REST conventions where:
 * - Collection operations (list, create) are at /data
 * - Individual resource operations (update, delete) are at /data/[id]
 *
 * This pattern:
 * 1. Makes URL structure clearer
 * 2. Follows Next.js dynamic routing conventions
 * 3. Separates "all resources" logic from "single resource" logic
 */

/**
 * Why defense-in-depth filtering?
 *
 * Even though RLS policies enforce user isolation at the database level,
 * we add explicit .eq('user_id', user.id) checks because:
 *
 * 1. Defense-in-depth: Multiple layers of security
 * 2. Explicit is better than implicit
 * 3. Easier to audit and understand
 * 4. Protects against potential RLS misconfiguration
 */

/**
 * Why trim() on string inputs?
 *
 * Trimming whitespace prevents:
 * 1. Accidental leading/trailing spaces
 * 2. "Empty" strings that are actually just spaces
 * 3. Inconsistent data in database
 * 4. UX issues with spaces in project names
 */

/**
 * Related files:
 * - ../../types/index.ts - TypeScript type definitions
 * - ./[id]/route.ts - PATCH and DELETE handlers
 * - ../../app/page.tsx - Main page that consumes this API
 * - ../../database/schema.sql - Database schema and RLS policies
 */
