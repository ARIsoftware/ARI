/**
 * Documents Module - Folders API Routes
 *
 * Endpoints:
 * - GET /api/modules/documents/folders - List all folders
 * - POST /api/modules/documents/folders - Create new folder
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { toSnakeCase, validateRequestBody, createErrorResponse } from '@/lib/api-helpers'
import { z } from 'zod'
import { documentFolders, documents } from '@/lib/db/schema'
import { eq, isNull, and, sql, count } from 'drizzle-orm'
import type { FolderWithChildren } from '../../types'
import { FOLDER_NAME_PATTERN, FOLDER_NAME_MAX_LENGTH } from '../../lib/utils'

const FOLDER_NAME_VALIDATION_MESSAGE =
  'Folder name may only contain letters, numbers, hyphens, and underscores'

const CreateFolderSchema = z.object({
  name: z.string().min(1).max(FOLDER_NAME_MAX_LENGTH).regex(FOLDER_NAME_PATTERN, FOLDER_NAME_VALIDATION_MESSAGE),
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
      return createErrorResponse('Authentication required', 401)
    }

    const { searchParams } = new URL(request.url)
    const flat = searchParams.get('flat') === 'true'
    const includeDeleted = searchParams.get('include_deleted') === 'true'

    const conditions = [eq(documentFolders.userId, user.id)]
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
        .where(and(eq(documents.userId, user.id), isNull(documents.deletedAt)))
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
    return createErrorResponse('Internal server error')
  }
}

/**
 * POST Handler - Create new folder
 */
export async function POST(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return createErrorResponse('Authentication required', 401)
    }

    const validation = await validateRequestBody(request, CreateFolderSchema)
    if (!validation.success) return validation.response

    const { name, parent_id } = validation.data

    // Verify parent folder exists if specified
    if (parent_id) {
      const parent = await withRLS((db: any) =>
        db.select()
          .from(documentFolders)
          .where(and(
            eq(documentFolders.userId, user.id),
            eq(documentFolders.id, parent_id),
            isNull(documentFolders.deletedAt)
          ))
          .limit(1)
      )
      if (parent.length === 0) {
        return createErrorResponse('Parent folder not found', 404)
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
    return createErrorResponse('Internal server error')
  }
}
