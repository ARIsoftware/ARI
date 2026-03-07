/**
 * Documents Module - File Restore API
 *
 * Endpoint:
 * - POST /api/modules/documents/files/[id]/restore - Restore file from trash
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { toSnakeCase } from '@/lib/api-helpers'
import { documents } from '@/lib/db/schema'
import { eq, and, isNotNull, sql } from 'drizzle-orm'

/**
 * POST Handler - Restore file from trash
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { id } = await params

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(id)) {
      return NextResponse.json(
        { error: 'Invalid ID format' },
        { status: 400 }
      )
    }

    // Verify document exists in trash
    const existing = await withRLS((db: any) =>
      db.select()
        .from(documents)
        .where(and(
          eq(documents.id, id),
          isNotNull(documents.deletedAt)
        ))
        .limit(1)
    )

    if (existing.length === 0) {
      return NextResponse.json(
        { error: 'Document not found in trash' },
        { status: 404 }
      )
    }

    // Restore by clearing deletedAt
    const restored = await withRLS((db: any) =>
      db.update(documents)
        .set({
          deletedAt: null,
          updatedAt: sql`timezone('utc'::text, now())`,
        })
        .where(eq(documents.id, id))
        .returning()
    )

    return NextResponse.json({
      success: true,
      message: 'Document restored successfully',
      document: toSnakeCase(restored[0]),
    })

  } catch (error) {
    console.error('POST /api/modules/documents/files/[id]/restore error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
