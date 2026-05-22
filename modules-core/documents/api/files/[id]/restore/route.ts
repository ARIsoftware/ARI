/**
 * Documents Module - File Restore API
 *
 * Endpoint:
 * - POST /api/modules/documents/files/[id]/restore - Restore file from trash
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { toSnakeCase, createErrorResponse } from '@/lib/api-helpers'
import { documents } from '@/lib/db/schema'
import { eq, and, isNotNull, sql } from 'drizzle-orm'

/**
 * POST Handler - Restore file from trash
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return createErrorResponse('Authentication required', 401)
    }

    const { id } = await params

    if (!z.string().uuid().safeParse(id).success) {
      return createErrorResponse('Invalid ID format', 400)
    }

    const restored = await withRLS((db: any) =>
      db.update(documents)
        .set({
          deletedAt: null,
          updatedAt: sql`timezone('utc'::text, now())`,
        })
        .where(and(
          eq(documents.id, id),
          eq(documents.userId, user.id),
          isNotNull(documents.deletedAt)
        ))
        .returning()
    )

    if (restored.length === 0) {
      return createErrorResponse('Document not found in trash', 404)
    }

    return NextResponse.json({
      success: true,
      message: 'Document restored successfully',
      document: toSnakeCase(restored[0]),
    })

  } catch (error) {
    console.error('POST /api/modules/documents/files/[id]/restore error:', error)
    return createErrorResponse('Internal server error')
  }
}
