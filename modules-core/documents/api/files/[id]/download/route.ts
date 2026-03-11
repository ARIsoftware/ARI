/**
 * Documents Module - File Download API
 *
 * Endpoint:
 * - GET /api/modules/documents/files/[id]/download - Get secure download URL
 *
 * Security: Returns a time-limited signed URL (5 minutes) for secure download.
 * The actual file is never served through this endpoint - only the signed URL.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { documents, moduleSettings } from '@/lib/db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { getStorageProvider } from '../../../../lib/providers'
import type { DocumentsSettings } from '../../../../types'
import { DEFAULT_DOCUMENTS_SETTINGS } from '../../../../types'

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
 * GET Handler - Generate signed download URL
 */
export async function GET(
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

    // Get document (RLS ensures user can only access their own)
    // Allow downloading from trash (don't filter by deletedAt)
    const doc = await withRLS((db: any) =>
      db.select()
        .from(documents)
        .where(eq(documents.id, id))
        .limit(1)
    )

    if (doc.length === 0) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      )
    }

    const document = doc[0]

    // Get settings to initialize storage provider
    const settings = await getSettings(withRLS)

    // Ensure we use the same provider that stored the file
    const providerSettings = {
      ...settings,
      storageProvider: document.storageProvider,
    } as DocumentsSettings

    const storageProvider = getStorageProvider(providerSettings)

    // Generate signed URL (expires in 5 minutes)
    const expiresInSeconds = 300
    const signedUrl = await storageProvider.getSignedUrl(document.storagePath, expiresInSeconds)

    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString()

    return NextResponse.json({
      url: signedUrl,
      filename: document.originalName,
      mime_type: document.mimeType,
      size_bytes: document.sizeBytes,
      expires_at: expiresAt,
    })

  } catch (error) {
    console.error('GET /api/modules/documents/files/[id]/download error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
