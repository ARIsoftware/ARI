/**
 * Documents Module - Folders API Routes
 *
 * Endpoints:
 * - GET /api/modules/documents/folders - List all folders
 * - POST /api/modules/documents/folders - Create new folder
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { toSnakeCase } from '@/lib/api-helpers'
import { z } from 'zod'
import { documentFolders, documents } from '@/lib/db/schema'
import { eq, isNull, and, sql, count } from 'drizzle-orm'
import type { FolderWithChildren } from '../../types'

const CreateFolderSchema = z.object({
  name: z.string().min(1).max(255),
  parent_id: z.string().uuid().nullable().optional(),
})

/**
 * Build nested folder tree structure
 */
function buildFolderTree(
  folders: any[],
  documentCounts: Map<string, number>,
  parentId: string | null = null
): FolderWithChildren[] {
  return folders
    .filter((f) => f.parentId === parentId)
    .map((folder) => ({
      ...folder,
      document_count: documentCounts.get(folder.id) || 0,
      children: buildFolderTree(folders, documentCounts, folder.id),
    }))
}

/**
 * GET Handler - List all folders
 */
export async function GET(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const flat = searchParams.get('flat') === 'true'
    const includeDeleted = searchParams.get('include_deleted') === 'true'

    // Build conditions
    const conditions = []
    if (!includeDeleted) {
      conditions.push(isNull(documentFolders.deletedAt))
    }

    // Fetch all folders
    const folders = await withRLS((db: any) =>
      db.select()
        .from(documentFolders)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(documentFolders.name)
    )

    // Get document counts per folder
    const documentCountsResult = await withRLS((db: any) =>
      db.select({
        folderId: documents.folderId,
        count: count(documents.id),
      })
        .from(documents)
        .where(isNull(documents.deletedAt))
        .groupBy(documents.folderId)
    )

    const documentCounts = new Map<string, number>()
    documentCountsResult.forEach((row: any) => {
      if (row.folderId) {
        documentCounts.set(row.folderId, Number(row.count))
      }
    })

    if (flat) {
      // Return flat list with document counts
      const foldersWithCounts = folders.map((f: any) => ({
        ...f,
        document_count: documentCounts.get(f.id) || 0,
      }))
      return NextResponse.json({
        folders: toSnakeCase(foldersWithCounts),
        count: folders.length,
      })
    }

    // Return nested tree structure
    const tree = buildFolderTree(folders, documentCounts)

    return NextResponse.json({
      folders: toSnakeCase(tree),
      count: folders.length,
    })

  } catch (error) {
    console.error('GET /api/modules/documents/folders error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST Handler - Create new folder
 */
export async function POST(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const parseResult = CreateFolderSchema.safeParse(body)

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parseResult.error.issues },
        { status: 400 }
      )
    }

    const { name, parent_id } = parseResult.data

    // Verify parent folder exists if specified
    if (parent_id) {
      const parent = await withRLS((db: any) =>
        db.select()
          .from(documentFolders)
          .where(and(
            eq(documentFolders.id, parent_id),
            isNull(documentFolders.deletedAt)
          ))
          .limit(1)
      )
      if (parent.length === 0) {
        return NextResponse.json(
          { error: 'Parent folder not found' },
          { status: 404 }
        )
      }
    }

    // Create folder
    const newFolder = await withRLS((db: any) =>
      db.insert(documentFolders)
        .values({
          userId: user.id,
          name,
          parentId: parent_id || null,
        })
        .returning()
    )

    return NextResponse.json(
      { folder: toSnakeCase(newFolder[0]) },
      { status: 201 }
    )

  } catch (error) {
    console.error('POST /api/modules/documents/folders error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
