import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { createErrorResponse, requireAdmin } from '@/lib/api-helpers'
import { withAdminDb } from '@/lib/db'
import { appBranding } from '@/lib/db/schema'
import { logActivity } from '@/lib/activity-log'
import {
  LOGIN_LOGO_MAX_BYTES,
  LOGIN_LOGO_TYPE_LABEL,
  isAllowedLogoType,
} from '@/lib/branding'
import { z } from 'zod'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema } from '@/lib/openapi/common'

// Admin-managed login-screen branding. The logo is stored inline (base64) in the
// single-row `app_branding` table so it survives storage-provider changes and can
// be served pre-auth by /api/branding/login-logo. See docs in lib/db/setup.sql.
// Size cap + accepted types are shared with the client via @/lib/branding.

const BrandingStatusSchema = z.object({
  hasLogo: z.boolean(),
  contentType: z.string().nullable().optional(),
  filename: z.string().nullable().optional(),
  updatedAt: z.string().nullable().optional(),
})

registry.registerPath({
  method: 'get',
  path: '/api/settings/branding',
  operationId: 'getLoginBranding',
  summary: 'Get login-screen logo metadata (admin only). Never returns the raw image bytes.',
  tags: ['app'],
  security: DEFAULT_SECURITY,
  responses: {
    200: { description: 'Current login-logo metadata', content: { 'application/json': { schema: BrandingStatusSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    403: { description: 'Admin access required', content: { 'application/json': { schema: ErrorResponseSchema } } },
  },
})

registry.registerPath({
  method: 'post',
  path: '/api/settings/branding',
  operationId: 'uploadLoginLogo',
  summary: 'Upload/replace the login-screen logo (admin only, multipart/form-data with `file`; 8MB max, image types only)',
  tags: ['app'],
  security: DEFAULT_SECURITY,
  request: {
    body: {
      content: {
        'multipart/form-data': {
          schema: z.object({ file: z.string().openapi({ format: 'binary' }) }),
        },
      },
    },
  },
  responses: {
    200: { description: 'Logo saved', content: { 'application/json': { schema: BrandingStatusSchema } } },
    400: { description: 'Missing/oversized/unsupported file', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    403: { description: 'Admin access required', content: { 'application/json': { schema: ErrorResponseSchema } } },
    413: { description: 'Request too large', content: { 'application/json': { schema: ErrorResponseSchema } } },
  },
})

registry.registerPath({
  method: 'delete',
  path: '/api/settings/branding',
  operationId: 'deleteLoginLogo',
  summary: 'Remove the login-screen logo and revert to the default (admin only)',
  tags: ['app'],
  security: DEFAULT_SECURITY,
  responses: {
    200: { description: 'Logo removed', content: { 'application/json': { schema: BrandingStatusSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    403: { description: 'Admin access required', content: { 'application/json': { schema: ErrorResponseSchema } } },
  },
})

/** GET — current login-logo metadata (never returns the raw bytes). */
export async function GET() {
  const { user } = await getAuthenticatedUser()
  const denied = requireAdmin(user)
  if (denied) return denied

  const row = await withAdminDb((db) =>
    db.select().from(appBranding).where(eq(appBranding.id, 1)).limit(1)
  )
  const branding = row[0]
  const hasLogo = !!branding?.loginLogoData

  return NextResponse.json({
    hasLogo,
    contentType: hasLogo ? branding?.loginLogoContentType ?? null : null,
    filename: hasLogo ? branding?.loginLogoFilename ?? null : null,
    updatedAt: hasLogo ? branding?.loginLogoUpdatedAt ?? null : null,
  })
}

/** POST — upload/replace the login logo (multipart/form-data with `file`). */
export async function POST(request: NextRequest) {
  const { user } = await getAuthenticatedUser()
  const denied = requireAdmin(user)
  if (denied || !user) return denied ?? createErrorResponse('Authentication required', 401)

  // Reject obviously oversized bodies before buffering them into memory.
  // Allow headroom above the 8MB image for multipart framing overhead.
  const contentLength = request.headers.get('content-length')
  if (contentLength && parseInt(contentLength, 10) > LOGIN_LOGO_MAX_BYTES + 1024 * 1024) {
    return createErrorResponse(
      'That image is too large. Please upload a logo of 8MB or less.',
      413
    )
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return createErrorResponse('Expected multipart/form-data with a file field', 400)
  }

  const file = formData.get('file')
  if (!file || !(file instanceof File)) {
    return createErrorResponse('Please choose an image file to upload.', 400)
  }

  // Exact size check — the friendly, authoritative 8MB gate.
  if (file.size > LOGIN_LOGO_MAX_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1)
    return createErrorResponse(
      `That image is ${sizeMb}MB, which is over the 8MB limit. Please choose a smaller logo (8MB max).`,
      400
    )
  }
  if (file.size === 0) {
    return createErrorResponse('That file appears to be empty. Please choose a valid image.', 400)
  }

  const contentType = (file.type || '').toLowerCase()
  if (!isAllowedLogoType(contentType)) {
    return createErrorResponse(
      `That file type isn't supported. Please upload a ${LOGIN_LOGO_TYPE_LABEL} image.`,
      400
    )
  }

  const base64 = Buffer.from(await file.arrayBuffer()).toString('base64')
  const now = new Date().toISOString()

  await withAdminDb((db) =>
    db
      .update(appBranding)
      .set({
        loginLogoData: base64,
        loginLogoContentType: contentType,
        loginLogoFilename: file.name?.slice(0, 255) ?? null,
        loginLogoUpdatedAt: now,
        loginLogoUpdatedBy: user.id,
      })
      .where(eq(appBranding.id, 1))
  )

  logActivity({
    userId: user.id,
    type: 'login_logo_updated',
    description: 'Updated the login-screen logo',
    metadata: { contentType },
  })

  return NextResponse.json({ hasLogo: true, contentType, updatedAt: now })
}

/** DELETE — remove the login logo (revert to the default login screen). */
export async function DELETE() {
  const { user } = await getAuthenticatedUser()
  const denied = requireAdmin(user)
  if (denied || !user) return denied ?? createErrorResponse('Authentication required', 401)

  await withAdminDb((db) =>
    db
      .update(appBranding)
      .set({
        loginLogoData: null,
        loginLogoContentType: null,
        loginLogoFilename: null,
        loginLogoUpdatedAt: new Date().toISOString(),
        loginLogoUpdatedBy: user.id,
      })
      .where(eq(appBranding.id, 1))
  )

  logActivity({
    userId: user.id,
    type: 'login_logo_removed',
    description: 'Removed the login-screen logo',
  })

  return NextResponse.json({ hasLogo: false })
}
