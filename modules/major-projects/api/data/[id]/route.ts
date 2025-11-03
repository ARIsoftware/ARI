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
import { validateRequestBody, createErrorResponse } from '@/lib/api-helpers'
import { z } from 'zod'
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

/**
 * PATCH Handler - Update an existing project
 *
 * Authentication: Required (Bearer token)
 * Path Params: id (UUID)
 * Body: { project_name?, project_description?, project_due_date? }
 * Returns: Updated project object
 *
 * Validation:
 * - id: Must be valid UUID format
 * - At least one field must be provided in body
 * - project_name: 1-255 characters if provided
 * - project_description: Max 2000 characters if provided
 * - project_due_date: ISO datetime or YYYY-MM-DD if provided
 *
 * Security:
 * - Validates authentication
 * - Validates UUID format to prevent injection
 * - Validates update data with Zod schema
 * - Explicit user_id filter ensures users can only update their own projects
 * - RLS provides additional enforcement
 *
 * @param request - Next.js request object with JSON body
 * @param params - Route parameters containing project id
 * @returns Updated project object or error response
 *
 * @example
 * ```
 * PATCH /api/modules/major-projects/data/abc123
 * Authorization: Bearer <token>
 * Content-Type: application/json
 *
 * Body:
 * {
 *   "project_due_date": "2025-12-31"
 * }
 *
 * Response (200 OK):
 * {
 *   "id": "abc123",
 *   "user_id": "user-uuid",
 *   "project_name": "Original Name",
 *   "project_description": "Original description",
 *   "project_due_date": "2025-12-31",
 *   "created_at": "2025-01-01T00:00:00.000Z",
 *   "updated_at": "2025-01-15T12:30:00.000Z"
 * }
 * ```
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Await params (Next.js 15 requirement)
    const { id } = await params

    // Step 1: Validate path parameter (UUID format)
    const paramValidation = uuidParamSchema.safeParse({ id })
    if (!paramValidation.success) {
      return createErrorResponse('Invalid project ID format', 400)
    }

    // Step 2: Validate request body
    const validation = await validateRequestBody(request, updateMajorProjectSchema)
    if (!validation.success) {
      return validation.response
    }

    const updateData = validation.data

    // Step 3: Authenticate user
    const { user, supabase } = await getAuthenticatedUser()

    if (!user) {
      return createErrorResponse('Authentication required', 401)
    }

    // Step 4: Build update object with cleaned data
    // Note: We manually set updated_at to ensure it's always current
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

    // Step 5: Update project in database
    // SECURITY: Explicit user filtering - only update user's own projects (defense-in-depth)
    const { data, error } = await supabase
      .from('major_projects')
      .update(cleanedData)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    // Step 6: Handle database errors
    if (error) {
      console.error('[MajorProjects] Error updating project:', error)
      return createErrorResponse(error.message, 500)
    }

    // Step 7: Handle not found case (project doesn't exist or user doesn't own it)
    if (!data) {
      return createErrorResponse('Project not found or access denied', 404)
    }

    // Step 8: Return updated project
    return NextResponse.json(data)

  } catch (error: any) {
    console.error('[MajorProjects] Error in PATCH /api/modules/major-projects/data/[id]:', error)
    return createErrorResponse('Internal server error', 500)
  }
}

// ============================================================================
// DELETE HANDLER - Delete project
// ============================================================================

/**
 * DELETE Handler - Delete a project
 *
 * Authentication: Required (Bearer token)
 * Path Params: id (UUID)
 * Body: None
 * Returns: { success: true }
 *
 * Validation:
 * - id: Must be valid UUID format
 *
 * Security:
 * - Validates authentication
 * - Validates UUID format to prevent injection
 * - Explicit user_id filter ensures users can only delete their own projects
 * - RLS provides additional enforcement
 *
 * Note: This is a hard delete. The project is permanently removed from the database.
 * If you need soft deletes (marking as deleted without removing), modify the schema
 * to include a deleted_at column.
 *
 * @param request - Next.js request object
 * @param params - Route parameters containing project id
 * @returns Success confirmation or error response
 *
 * @example
 * ```
 * DELETE /api/modules/major-projects/data/abc123
 * Authorization: Bearer <token>
 *
 * Response (200 OK):
 * {
 *   "success": true
 * }
 * ```
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Await params (Next.js 15 requirement)
    const { id } = await params

    // Step 1: Validate path parameter (UUID format)
    const paramValidation = uuidParamSchema.safeParse({ id })
    if (!paramValidation.success) {
      return createErrorResponse('Invalid project ID format', 400)
    }

    // Step 2: Authenticate user
    const { user, supabase } = await getAuthenticatedUser()

    if (!user) {
      return createErrorResponse('Authentication required', 401)
    }

    // Step 3: Delete project from database
    // SECURITY: Explicit user filtering - only delete user's own projects (defense-in-depth)
    const { error } = await supabase
      .from('major_projects')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    // Step 4: Handle database errors
    if (error) {
      console.error('[MajorProjects] Error deleting project:', error)
      return createErrorResponse(error.message, 500)
    }

    // Step 5: Return success
    // Note: Supabase delete doesn't return data, so we can't check if anything was deleted
    // If the project didn't exist or user didn't own it, this still returns success
    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error('[MajorProjects] Error in DELETE /api/modules/major-projects/data/[id]:', error)
    return createErrorResponse('Internal server error', 500)
  }
}

// ============================================================================
// DEVELOPER NOTES
// ============================================================================

/**
 * Why validate UUID format?
 *
 * Validating the UUID format before using it in queries:
 * 1. Prevents SQL injection attempts (though Supabase client is safe)
 * 2. Provides better error messages for invalid IDs
 * 3. Catches client-side bugs earlier
 * 4. Prevents unnecessary database queries with invalid IDs
 */

/**
 * Why manual updated_at in PATCH?
 *
 * While we have a database trigger that updates updated_at, we set it manually because:
 * 1. Ensures consistent timezone (server time)
 * 2. Makes the behavior explicit and testable
 * 3. Trigger is a backup, not the primary mechanism
 * 4. Works even if trigger is temporarily disabled
 */

/**
 * Why .single() on UPDATE but not DELETE?
 *
 * UPDATE:
 * - We use .single() because we want to return the updated project
 * - If no rows matched, data will be null, which we check for 404
 * - This gives us the updated data in one query
 *
 * DELETE:
 * - DELETE doesn't return data by default
 * - Supabase delete operations don't fail if nothing was deleted
 * - We return success regardless (idempotent delete)
 * - To check if something was deleted, you'd need to query first
 */

/**
 * Should we implement soft deletes?
 *
 * Current: Hard delete (permanent removal)
 * Alternative: Soft delete (add deleted_at column, set timestamp instead of deleting)
 *
 * Soft delete pros:
 * - Can restore deleted projects
 * - Audit trail of deletions
 * - Can enforce business rules (e.g., can't delete projects with tasks)
 *
 * Soft delete cons:
 * - More complex queries (must filter deleted_at IS NULL everywhere)
 * - Database grows over time
 * - Need additional "permanently delete" functionality
 *
 * For this module, hard delete is appropriate because:
 * 1. Projects are user-specific (not shared)
 * 2. Users expect delete to mean "gone"
 * 3. Can always restore from backups if needed
 */

/**
 * Related files:
 * - ../route.ts - GET and POST handlers
 * - ../../../types/index.ts - TypeScript type definitions
 * - ../../../app/page.tsx - Main page that consumes this API
 * - ../../../database/schema.sql - Database schema and RLS policies
 */
