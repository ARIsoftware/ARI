/**
 * Documents Module - Files API Routes
 *
 * Endpoints:
 * - GET /api/modules/documents/files  - List files with filtering
 * - POST /api/modules/documents/files - Upload new file
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { toSnakeCase, validateRequestBody, createErrorResponse } from '@/lib/api-helpers'
import { z } from 'zod'
import { documents, documentFolders, documentTags, documentTagAssignments } from '@/lib/db/schema'
import { eq, desc, isNull, and, inArray, gte, lte, sql } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'
import { getStorageProvider, getCurrentBucket, getActiveProvider } from '../../lib/providers'
import { getDocumentsSettings } from '../../lib/get-settings'
import type { DocumentWithTags, StorageProvider } from '../../types'
import { RISKY_MIME_TYPES } from '../../types'
import { isPreviewableImage } from '../../lib/utils'
import {
  listFilesQuerySchema,
  FileListResponseSchema,
  UploadFileFormSchema,
  DocumentSingleResponseSchema,
  BulkFilesBodySchema,
  BulkFilesResponseSchema,
} from '../../lib/validation'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse, UnauthorizedResponse } from '@/lib/openapi/common'

registry.registerPath({
  method: 'get',
  path: '/api/modules/documents/files',
  operationId: 'listDocumentFiles',
  summary: 'List the user\'s document files with filtering, search, and pagination',
  tags: ['documents'],
  security: DEFAULT_SECURITY,
  request: { query: listFilesQuerySchema },
  responses: {
    200: { description: 'Page of files (each augmented with tags and optional preview URL)', content: { 'application/json': { schema: FileListResponseSchema } } },
    400: { description: 'Validation error', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: UnauthorizedResponse,
    500: InternalServerErrorResponse,
  },
})

registry.registerPath({
  method: 'post',
  path: '/api/modules/documents/files',
  operationId: 'uploadDocumentFile',
  summary: 'Upload a new file (multipart). folder_id and tag_ids are optional.',
  tags: ['documents'],
  security: DEFAULT_SECURITY,
  request: { body: { content: { 'multipart/form-data': { schema: UploadFileFormSchema } } } },
  responses: {
    201: { description: 'Created document row (no tags array)', content: { 'application/json': { schema: DocumentSingleResponseSchema } } },
    400: { description: 'Validation error, missing file, disallowed type, or onboarding incomplete', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: UnauthorizedResponse,
    404: { description: 'Folder not found', content: { 'application/json': { schema: ErrorResponseSchema } } },
    413: { description: 'File too large for configured max size', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

registry.registerPath({
  method: 'patch',
  path: '/api/modules/documents/files',
  operationId: 'bulkDocumentFiles',
  summary: 'Bulk delete / move / tag multiple documents in one request',
  tags: ['documents'],
  security: DEFAULT_SECURITY,
  request: { body: { content: { 'application/json': { schema: BulkFilesBodySchema } } } },
  responses: {
    200: { description: 'Number of rows affected', content: { 'application/json': { schema: BulkFilesResponseSchema } } },
    400: { description: 'Validation error or a referenced tag does not exist', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: UnauthorizedResponse,
    404: { description: 'One or more documents (or target folder) do not exist', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

// Tag-id arrays come in as comma-separated strings from GET query params and
// the upload form. Cap at 100 to bound any later cross-product inserts
// (500 docs × 100 tags = 50k rows max in the bulk-tag path).
const TagIdsSchema = z.array(z.string().uuid()).max(100)

// Single schema for the GET handler's filter params that need shape
// validation: tag_ids (comma-separated UUIDs), date_from / date_to (coerced
// to Date so the ordering check can compare directly), with date_from <=
// date_to enforced via refine.
const FilterParamsSchema = z.object({
  tag_ids: z.array(z.string().uuid()).max(100).optional(),
  date_from: z.coerce.date().optional(),
  date_to: z.coerce.date().optional(),
}).refine(
  (d) => !d.date_from || !d.date_to || d.date_from.getTime() <= d.date_to.getTime(),
  { message: 'date_from must be <= date_to', path: ['date_to'] },
)

const BulkSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('delete'),
    ids: z.array(z.string().uuid()).min(1).max(500),
  }),
  z.object({
    action: z.literal('move'),
    ids: z.array(z.string().uuid()).min(1).max(500),
    folder_id: z.string().uuid().nullable(),
  }),
  z.object({
    action: z.literal('tag'),
    ids: z.array(z.string().uuid()).min(1).max(500),
    tag_ids: TagIdsSchema,
  }),
])

// MIME types whose legitimate payload IS script-capable markup. When the
// operator has explicitly allowlisted one of these, content that sniffs as
// markup is expected and allowed; otherwise markup content is a type mismatch.
const ACTIVE_MARKUP_MIME_TYPES = new Set([
  'text/html',
  'application/xhtml+xml',
  'image/svg+xml',
  'application/xml',
  'text/xml',
])

/**
 * Sniff the leading bytes of an uploaded file for script-capable markup
 * (HTML / SVG / XML-with-script / PHP). The declared MIME type (`file.type`) is
 * attacker-controlled, so it can't be trusted alone: a file can claim
 * `image/png` while carrying `<script>…</script>`. We scan the first 1 KB
 * (case-insensitively, after skipping a BOM and leading whitespace) for the
 * signatures that matter for stored-XSS.
 */
function sniffsAsActiveMarkup(buffer: Buffer): boolean {
  const head = buffer
    .subarray(0, 1024)
    .toString('latin1')
    .replace(/^(\xEF\xBB\xBF|\xFF\xFE|\xFE\xFF)/, '') // UTF-8 / UTF-16 BOMs
    .replace(/^\s+/, '')
    .toLowerCase()

  if (
    head.startsWith('<!doctype html') ||
    head.startsWith('<html') ||
    head.startsWith('<script') ||
    head.startsWith('<svg') ||
    head.startsWith('<?php')
  ) {
    return true
  }
  // SVG/HTML that opens with an <?xml …?> prolog.
  if (head.startsWith('<?xml') && /<\s*(svg|script)\b/.test(head)) {
    return true
  }
  return false
}

/**
 * GET Handler - List files with optional filtering
 */
export async function GET(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return createErrorResponse('Authentication required', 401)
    }

    const { searchParams } = new URL(request.url)
    const folderId = searchParams.get('folder_id')
    const search = searchParams.get('search')
    const mimeTypes = searchParams.get('mime_types')?.split(',').filter(Boolean)
    const includeDeleted = searchParams.get('include_deleted') === 'true'
    const deletedOnly = searchParams.get('deleted_only') === 'true'

    // Validate the filter params that need shape checks (tag_ids as UUIDs,
    // dates as ISO 8601, date_from <= date_to). Cleaner 400 than letting
    // ::uuid[] casts or invalid date strings fail opaquely downstream.
    const rawTagIds = searchParams.get('tag_ids')?.split(',').filter(Boolean)
    const filterParse = FilterParamsSchema.safeParse({
      tag_ids: rawTagIds && rawTagIds.length > 0 ? rawTagIds : undefined,
      date_from: searchParams.get('date_from') ?? undefined,
      date_to: searchParams.get('date_to') ?? undefined,
    })
    if (!filterParse.success) {
      return createErrorResponse(
        `Invalid filter params: ${filterParse.error.issues[0]?.message ?? 'unknown'}`,
        400,
      )
    }
    const { tag_ids: tagIds, date_from: dateFrom, date_to: dateTo } = filterParse.data
    // Opt-out switch for image preview URLs. Defaults to on; callers showing
    // a table view (no thumbnails) can pass with_previews=false to skip the
    // signed-URL roundtrips entirely.
    const withPreviews = searchParams.get('with_previews') !== 'false'

    // Pagination — limit defaults to 50, capped at 200. Offset capped at 10_000
    // (UIs that need deeper scans should switch to keyset on (created_at, id)).
    const rawLimit = Number(searchParams.get('limit') ?? '50')
    const limit = Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(Math.floor(rawLimit), 200)
      : 50
    const rawOffset = Number(searchParams.get('offset') ?? '0')
    const offset = Number.isFinite(rawOffset) && rawOffset >= 0
      ? Math.min(Math.floor(rawOffset), 10_000)
      : 0

    const conditions = [eq(documents.userId, user.id)]

    if (folderId === 'root' || folderId === '') {
      // Sentinel: caller wants documents at the root (folder_id IS NULL).
      conditions.push(isNull(documents.folderId))
    } else if (folderId) {
      conditions.push(eq(documents.folderId, folderId))
    }

    if (search) {
      // Case-insensitive substring match so partial queries like "scre" find
      // "Screenshot.png". Escape LIKE wildcards so they're treated literally.
      const escaped = search.replace(/[%_\\]/g, '\\$&')
      conditions.push(sql`${documents.name} ILIKE ${'%' + escaped + '%'} ESCAPE '\\'`)
    }

    if (mimeTypes && mimeTypes.length > 0) {
      conditions.push(inArray(documents.mimeType, mimeTypes))
    }

    if (dateFrom) {
      conditions.push(gte(documents.createdAt, dateFrom.toISOString()))
    }
    if (dateTo) {
      conditions.push(lte(documents.createdAt, dateTo.toISOString()))
    }

    if (deletedOnly) {
      conditions.push(sql`${documents.deletedAt} IS NOT NULL`)
    } else if (!includeDeleted) {
      conditions.push(isNull(documents.deletedAt))
    }

    // Push tag filter into SQL via EXISTS (single index-friendly query;
    // replaces the previous fetch-all-then-filter-in-JS pattern).
    if (tagIds && tagIds.length > 0) {
      conditions.push(
        sql`EXISTS (
          SELECT 1 FROM ${documentTagAssignments} dta
          WHERE dta.document_id = ${documents.id}
            AND dta.tag_id = ANY(${tagIds}::uuid[])
        )`
      )
    }

    // limit+1 so we can detect has_more without a separate COUNT(*).
    const files = await withRLS((db) =>
      db.select()
        .from(documents)
        .where(and(...conditions))
        .orderBy(desc(documents.createdAt))
        .limit(limit + 1)
        .offset(offset)
    )

    const hasMore = files.length > limit
    const pageFiles = hasMore ? files.slice(0, limit) : files

    const fileIds = pageFiles.map((f: any) => f.id)
    let tagAssignments: any[] = []
    let allTags: any[] = []

    if (fileIds.length > 0) {
      tagAssignments = await withRLS((db) =>
        db.select()
          .from(documentTagAssignments)
          .where(inArray(documentTagAssignments.documentId, fileIds))
      )

      const tagIdsFromAssignments = [...new Set(tagAssignments.map((ta: any) => ta.tagId))]
      if (tagIdsFromAssignments.length > 0) {
        allTags = await withRLS((db) =>
          db.select()
            .from(documentTags)
            .where(inArray(documentTags.id, tagIdsFromAssignments))
        )
      }
    }

    const filesWithTags: DocumentWithTags[] = pageFiles.map((file: any) => {
      const fileTagIds = tagAssignments
        .filter((ta: any) => ta.documentId === file.id)
        .map((ta: any) => ta.tagId)
      const fileTags = allTags.filter((t: any) => fileTagIds.includes(t.id))
      return {
        ...file,
        tags: fileTags,
      }
    })

    // For image files, attach a signed preview URL. Files may have been
    // uploaded under different providers or historical bucket names —
    // getStorageProvider() caches by (provider, bucket) at module scope.
    if (pageFiles.length > 0 && withPreviews) {
      await Promise.all(
        filesWithTags.map(async (file: any) => {
          if (isPreviewableImage(file.mimeType)) {
            try {
              const provider = getStorageProvider(
                file.storageProvider as StorageProvider,
                file.storageBucket
              )
              file.previewUrl = await provider.getSignedUrl(file.storagePath, 600)
            } catch (err) {
              console.error('[documents] preview URL gen failed', { fileId: file.id, err })
            }
          }
        })
      )
    }

    return NextResponse.json({
      files: toSnakeCase(filesWithTags),
      count: filesWithTags.length,
      limit,
      offset,
      has_more: hasMore,
    })

  } catch (error) {
    console.error('GET /api/modules/documents/files error:', error)
    return createErrorResponse('Internal server error')
  }
}

/**
 * POST Handler - Upload a new file
 */
export async function POST(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return createErrorResponse('Authentication required', 401)
    }

    // Get settings to check storage provider and limits
    const settings = await getDocumentsSettings(withRLS, user.id)

    if (!settings.onboardingCompleted) {
      return createErrorResponse('Please complete the Documents module setup first', 400)
    }

    const maxSizeBytes = settings.maxFileSizeMb * 1024 * 1024

    // Reject early via Content-Length so we don't buffer a giant body just to
    // reject it. Allow a small headroom for the multipart envelope.
    const contentLengthHeader = request.headers.get('content-length')
    if (contentLengthHeader) {
      const contentLength = Number(contentLengthHeader)
      if (Number.isFinite(contentLength) && contentLength > maxSizeBytes + 1024) {
        return createErrorResponse(`Upload exceeds maximum of ${settings.maxFileSizeMb}MB`, 413)
      }
    }

    // Parse multipart form data
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const folderId = formData.get('folder_id') as string | null
    const tagIdsStr = formData.get('tag_ids') as string | null

    if (!file) {
      return createErrorResponse('No file provided', 400)
    }

    // The display name is derived from the untrusted, unbounded filename. Trim
    // it, reject an empty name, and cap at 255 to match the rename path
    // (updateDocumentSchema). The `name` column is unbounded TEXT, so an
    // oversized filename would bloat list responses and the search index. The
    // storage *key* is a server-generated UUID, so this only governs the
    // human-readable name.
    const displayName = (file.name ?? '').trim().slice(0, 255)
    if (!displayName) {
      return createErrorResponse('File must have a non-empty name', 400)
    }

    // Validate any supplied tag ids up front — same shape as the bulk PATCH
    // endpoint so the row insert can't land non-UUID values that the FK will
    // reject opaquely.
    let validatedTagIds: string[] = []
    if (tagIdsStr) {
      const rawTagIds = tagIdsStr.split(',').filter(Boolean)
      if (rawTagIds.length > 0) {
        const parsed = TagIdsSchema.safeParse(rawTagIds)
        if (!parsed.success) {
          return createErrorResponse('Invalid tag_ids: must be a comma-separated list of UUIDs (max 100)', 400)
        }
        validatedTagIds = parsed.data
      }
    }

    // Validate file size (backstop; Content-Length check above is the fast path)
    if (file.size > maxSizeBytes) {
      return createErrorResponse(`File size exceeds maximum of ${settings.maxFileSizeMb}MB`, 413)
    }

    // Buffer the upload once, up front: we need the raw bytes both for the
    // content-type sniff below and for the storage write further down.
    const fileBuffer = Buffer.from(await file.arrayBuffer())

    // Validate file type. If an allowlist is configured, it's authoritative.
    // Otherwise, reject types that can host script content (HTML, SVG, generic
    // application/x-* archives/executables). This neutralizes stored-XSS via
    // signed-URL fetches even though signed URLs now force Content-Disposition:
    // attachment — defense-in-depth in case a future change relaxes that.
    //
    // The declared MIME (file.type) is attacker-controlled, so we ALSO sniff the
    // leading bytes: content that is script-capable markup is rejected even when
    // it claims to be something benign (e.g. text/html bytes declared image/png).
    // This closes the bypass where a forged MIME slips past the denylist.
    const clientMime = (file.type || '').toLowerCase()
    const looksLikeActiveMarkup = sniffsAsActiveMarkup(fileBuffer)

    if (settings.allowedFileTypes.length > 0) {
      if (!settings.allowedFileTypes.includes(file.type)) {
        return createErrorResponse('File type not allowed', 400)
      }
      // An allowlisted markup type (e.g. image/svg+xml) may legitimately contain
      // markup; markup content wearing a non-markup allowlisted type may not.
      if (looksLikeActiveMarkup && !ACTIVE_MARKUP_MIME_TYPES.has(clientMime)) {
        return createErrorResponse('File content does not match its declared type', 400)
      }
    } else {
      const isRisky =
        RISKY_MIME_TYPES.includes(clientMime) ||
        clientMime.startsWith('application/x-') ||
        looksLikeActiveMarkup
      if (isRisky) {
        return createErrorResponse('File type not allowed', 400)
      }
    }

    // Verify folder exists BEFORE uploading so an invalid folder_id can't
    // leave an orphaned object in cloud storage.
    if (folderId) {
      const folder = await withRLS((db) =>
        db.select()
          .from(documentFolders)
          .where(and(
            eq(documentFolders.userId, user.id),
            eq(documentFolders.id, folderId),
            isNull(documentFolders.deletedAt)
          ))
          .limit(1)
      )
      if (folder.length === 0) {
        return createErrorResponse('Folder not found', 404)
      }
    }

    // Generate unique storage key. The extension is derived from the (untrusted)
    // original filename but stripped to ASCII alphanumerics and capped at 10
    // chars to prevent path traversal (`/`, `..`, null bytes, etc.) in the key.
    const fileId = uuidv4()
    const rawExt = file.name.includes('.') ? (file.name.split('.').pop() ?? '') : ''
    const safeExt = rawExt.replace(/[^A-Za-z0-9]/g, '').slice(0, 10).toLowerCase()
    const storedFilename = safeExt ? `${fileId}.${safeExt}` : fileId

    // Upload to the active storage provider (from ARI_STORAGE_PROVIDER).
    // Snapshot the provider + bucket on the row so future reads still work
    // after the global config changes.
    const activeProvider = getActiveProvider()
    const storageBucket = getCurrentBucket(activeProvider)
    const storageProvider = getStorageProvider(activeProvider, storageBucket)
    const { path: storagePath, size } = await storageProvider.upload(
      user.id,
      storedFilename,
      fileBuffer,
      file.type
    )

    // From here on, any failure must clean up the just-uploaded object so we
    // don't accumulate orphans in cloud storage.
    let newDoc: any[]
    try {
      newDoc = await withRLS((db) =>
        db.insert(documents)
          .values({
            userId: user.id,
            name: displayName,
            originalName: displayName,
            storageProvider: activeProvider,
            storagePath,
            storageBucket: storageBucket || null,
            sizeBytes: size,
            mimeType: file.type || 'application/octet-stream',
            folderId: folderId || null,
          })
          .returning()
      )

      if (validatedTagIds.length > 0 && newDoc.length > 0) {
        const tagAssignmentValues = validatedTagIds.map((tagId) => ({
          userId: user.id,
          documentId: newDoc[0].id,
          tagId,
        }))
        await withRLS((db) =>
          db.insert(documentTagAssignments)
            .values(tagAssignmentValues)
        )
      }
    } catch (err) {
      // Best-effort cleanup of the orphaned object. Don't mask the original error.
      storageProvider.delete(storagePath).catch((cleanupErr) => {
        console.error('[documents] orphan cleanup failed', { storagePath, cleanupErr })
      })
      throw err
    }

    return NextResponse.json(
      { document: toSnakeCase(newDoc[0]) },
      { status: 201 }
    )

  } catch (error) {
    console.error('POST /api/modules/documents/files error:', error)
    return createErrorResponse('Internal server error')
  }
}

/**
 * PATCH Handler - Bulk operations (delete / move / tag) on multiple files
 * in a single round-trip, replacing per-id client fan-out.
 */
export async function PATCH(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return createErrorResponse('Authentication required', 401)
    }

    const validation = await validateRequestBody(request, BulkSchema)
    if (!validation.success) return validation.response

    const payload = validation.data
    const { ids } = payload
    const now = sql`timezone('utc'::text, now())`

    if (payload.action === 'delete') {
      // Verify ownership of every id BEFORE the soft-delete — otherwise a
      // 404 path would commit a partial soft-delete on the rows that did
      // exist, and the optimistic UI rollback would hide it.
      const owned = await withRLS((db) =>
        db.select({ id: documents.id })
          .from(documents)
          .where(and(
            eq(documents.userId, user.id),
            inArray(documents.id, ids),
            isNull(documents.deletedAt)
          ))
      )
      if (owned.length !== ids.length) {
        return createErrorResponse('One or more documents do not exist', 404)
      }
      const result = await withRLS((db) =>
        db.update(documents)
          .set({ deletedAt: now, updatedAt: now })
          .where(and(
            eq(documents.userId, user.id),
            inArray(documents.id, ids),
            isNull(documents.deletedAt)
          ))
          .returning({ id: documents.id })
      )
      return NextResponse.json({ updated: result.length })
    }

    if (payload.action === 'move') {
      const { folder_id } = payload
      if (folder_id !== null) {
        const folder = await withRLS((db) =>
          db.select({ id: documentFolders.id })
            .from(documentFolders)
            .where(and(
              eq(documentFolders.id, folder_id),
              eq(documentFolders.userId, user.id),
              isNull(documentFolders.deletedAt)
            ))
            .limit(1)
        )
        if (folder.length === 0) {
          return createErrorResponse('Target folder not found', 404)
        }
      }
      // Skip the no-op rows so updated_at only bumps when folder_id actually changes.
      const result = await withRLS((db) =>
        db.update(documents)
          .set({ folderId: folder_id, updatedAt: now })
          .where(and(
            eq(documents.userId, user.id),
            inArray(documents.id, ids),
            sql`${documents.folderId} IS DISTINCT FROM ${folder_id}`
          ))
          .returning({ id: documents.id })
      )
      return NextResponse.json({ updated: result.length })
    }

    // payload.action === 'tag'
    const { tag_ids } = payload
    // The tag-replace flow (DELETE + INSERT cross-product) can't surface
    // "one of the document ids was bogus" purely from rowcounts the way
    // delete/move can, so verify ownership of every doc id up front.
    const owned = await withRLS((db) =>
      db.select({ id: documents.id })
        .from(documents)
        .where(and(
          eq(documents.userId, user.id),
          inArray(documents.id, ids)
        ))
    )
    if (owned.length !== ids.length) {
      return createErrorResponse('One or more documents do not exist', 404)
    }
    if (tag_ids.length > 0) {
      const ownedTags = await withRLS((db) =>
        db.select({ id: documentTags.id })
          .from(documentTags)
          .where(and(
            eq(documentTags.userId, user.id),
            inArray(documentTags.id, tag_ids)
          ))
      )
      if (ownedTags.length !== tag_ids.length) {
        return createErrorResponse('One or more tags do not exist', 400)
      }
    }
    // DELETE + INSERT must share a transaction so a failed insert rolls back
    // the delete — withRLS wraps the whole callback in BEGIN/COMMIT.
    await withRLS(async (db) => {
      await db.delete(documentTagAssignments)
        .where(inArray(documentTagAssignments.documentId, ids))
      if (tag_ids.length > 0) {
        const rows = ids.flatMap((docId) =>
          tag_ids.map((tagId) => ({ userId: user.id, documentId: docId, tagId }))
        )
        await db.insert(documentTagAssignments).values(rows)
      }
    })
    return NextResponse.json({ updated: ids.length })

  } catch (error) {
    console.error('PATCH /api/modules/documents/files error:', error)
    return createErrorResponse('Internal server error')
  }
}
