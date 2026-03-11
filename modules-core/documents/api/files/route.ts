/**
 * Documents Module - Files API Routes
 *
 * Endpoints:
 * - GET /api/modules/documents/files  - List files with filtering
 * - POST /api/modules/documents/files - Upload new file
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { toSnakeCase } from '@/lib/api-helpers'
import { z } from 'zod'
import { documents, documentFolders, documentTags, documentTagAssignments, moduleSettings } from '@/lib/db/schema'
import { eq, desc, isNull, and, like, inArray, gte, lte, sql } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'
import { getStorageProvider } from '../../lib/providers'
import type { DocumentsSettings, DocumentWithTags } from '../../types'
import { DEFAULT_DOCUMENTS_SETTINGS } from '../../types'

async function getSettings(withRLS: any): Promise<DocumentsSettings> {
  const data = await withRLS((db: any) =>
    db.select({ settings: moduleSettings.settings })
      .from(moduleSettings)
      .where(eq(moduleSettings.moduleId, 'documents'))
      .limit(1)
  )

  if (data.length === 0) {
    return DEFAULT_DOCUMENTS_SETTINGS
  }

  return {
    ...DEFAULT_DOCUMENTS_SETTINGS,
    ...(data[0]?.settings as object || {}),
  } as DocumentsSettings
}

/**
 * GET Handler - List files with optional filtering
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
    const folderId = searchParams.get('folder_id')
    const search = searchParams.get('search')
    const mimeTypes = searchParams.get('mime_types')?.split(',').filter(Boolean)
    const tagIds = searchParams.get('tag_ids')?.split(',').filter(Boolean)
    const dateFrom = searchParams.get('date_from')
    const dateTo = searchParams.get('date_to')
    const includeDeleted = searchParams.get('include_deleted') === 'true'

    // Build conditions
    const conditions = []

    // Filter by folder (null means root)
    if (folderId === 'root' || folderId === '') {
      conditions.push(isNull(documents.folderId))
    } else if (folderId) {
      conditions.push(eq(documents.folderId, folderId))
    }

    // Search by name
    if (search) {
      conditions.push(like(documents.name, `%${search}%`))
    }

    // Filter by MIME types
    if (mimeTypes && mimeTypes.length > 0) {
      conditions.push(inArray(documents.mimeType, mimeTypes))
    }

    // Date range filter
    if (dateFrom) {
      conditions.push(gte(documents.createdAt, dateFrom))
    }
    if (dateTo) {
      conditions.push(lte(documents.createdAt, dateTo))
    }

    // Soft delete filter (exclude deleted by default)
    if (!includeDeleted) {
      conditions.push(isNull(documents.deletedAt))
    }

    // Fetch files
    const files = await withRLS((db: any) =>
      db.select()
        .from(documents)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(documents.createdAt))
    )

    // Fetch tags for each file
    const fileIds = files.map((f: any) => f.id)
    let tagAssignments: any[] = []
    let allTags: any[] = []

    if (fileIds.length > 0) {
      tagAssignments = await withRLS((db: any) =>
        db.select()
          .from(documentTagAssignments)
          .where(inArray(documentTagAssignments.documentId, fileIds))
      )

      const tagIdsFromAssignments = [...new Set(tagAssignments.map((ta: any) => ta.tagId))]
      if (tagIdsFromAssignments.length > 0) {
        allTags = await withRLS((db: any) =>
          db.select()
            .from(documentTags)
            .where(inArray(documentTags.id, tagIdsFromAssignments))
        )
      }
    }

    // Combine files with their tags
    const filesWithTags: DocumentWithTags[] = files.map((file: any) => {
      const fileTagIds = tagAssignments
        .filter((ta: any) => ta.documentId === file.id)
        .map((ta: any) => ta.tagId)
      const fileTags = allTags.filter((t: any) => fileTagIds.includes(t.id))
      return {
        ...file,
        tags: fileTags,
      }
    })

    // If filtering by tags, do it client-side after fetching
    let filteredFiles = filesWithTags
    if (tagIds && tagIds.length > 0) {
      filteredFiles = filesWithTags.filter((file) =>
        tagIds.some((tagId) => file.tags.some((t) => t.id === tagId))
      )
    }

    return NextResponse.json({
      files: toSnakeCase(filteredFiles),
      count: filteredFiles.length,
    })

  } catch (error) {
    console.error('GET /api/modules/documents/files error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST Handler - Upload a new file
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

    // Get settings to check storage provider and limits
    const settings = await getSettings(withRLS)

    if (!settings.onboardingCompleted) {
      return NextResponse.json(
        { error: 'Please complete the Documents module setup first' },
        { status: 400 }
      )
    }

    // Parse multipart form data
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const folderId = formData.get('folder_id') as string | null
    const tagIdsStr = formData.get('tag_ids') as string | null

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      )
    }

    // Validate file size
    const maxSizeBytes = settings.maxFileSizeMb * 1024 * 1024
    if (file.size > maxSizeBytes) {
      return NextResponse.json(
        { error: `File size exceeds maximum of ${settings.maxFileSizeMb}MB` },
        { status: 400 }
      )
    }

    // Validate file type if restrictions are set
    if (settings.allowedFileTypes.length > 0) {
      if (!settings.allowedFileTypes.includes(file.type)) {
        return NextResponse.json(
          { error: 'File type not allowed' },
          { status: 400 }
        )
      }
    }

    // Generate unique filename with UUID prefix to prevent collisions
    const fileId = uuidv4()
    const extension = file.name.includes('.') ? '.' + file.name.split('.').pop() : ''
    const storedFilename = `${fileId}${extension}`

    // Upload to storage provider
    const storageProvider = getStorageProvider(settings)
    const fileBuffer = Buffer.from(await file.arrayBuffer())
    const { path: storagePath, size } = await storageProvider.upload(
      user.id,
      storedFilename,
      fileBuffer,
      file.type
    )

    // Verify folder exists if specified
    if (folderId) {
      const folder = await withRLS((db: any) =>
        db.select()
          .from(documentFolders)
          .where(and(
            eq(documentFolders.id, folderId),
            isNull(documentFolders.deletedAt)
          ))
          .limit(1)
      )
      if (folder.length === 0) {
        return NextResponse.json(
          { error: 'Folder not found' },
          { status: 404 }
        )
      }
    }

    // Create document record
    const newDoc = await withRLS((db: any) =>
      db.insert(documents)
        .values({
          userId: user.id,
          name: file.name,
          originalName: file.name,
          storageProvider: settings.storageProvider,
          storagePath,
          sizeBytes: size,
          mimeType: file.type || 'application/octet-stream',
          folderId: folderId || null,
        })
        .returning()
    )

    // Add tag assignments if specified
    if (tagIdsStr && newDoc.length > 0) {
      const tagIds = tagIdsStr.split(',').filter(Boolean)
      if (tagIds.length > 0) {
        const tagAssignmentValues = tagIds.map((tagId) => ({
          documentId: newDoc[0].id,
          tagId,
        }))
        await withRLS((db: any) =>
          db.insert(documentTagAssignments)
            .values(tagAssignmentValues)
        )
      }
    }

    return NextResponse.json(
      { document: toSnakeCase(newDoc[0]) },
      { status: 201 }
    )

  } catch (error) {
    console.error('POST /api/modules/documents/files error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
