import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { createErrorResponse, validateRequestBody } from '@/lib/api-helpers'
import { z } from 'zod'
import { existsSync } from 'fs'
import { resolve } from 'path'
import { readStorageConfig, writeStorageConfig, clearProviderCache } from '@/lib/storage'
import type { StorageConfig } from '@/lib/storage'
import { SENSITIVE_FIELDS } from '@/lib/storage/config'
import { encrypt, decrypt, isEncrypted } from '@/lib/crypto'

// Reusable field validators
const bucketName = z.string().max(63).regex(/^[a-z0-9][a-z0-9.\-]*[a-z0-9]$/, 'Bucket name must be lowercase, start/end with alphanumeric, and contain only a-z, 0-9, hyphens, or dots').optional()
const accessKeyId = z.string().max(128).regex(/^[A-Za-z0-9/+=_\-]+$/, 'Invalid access key format').optional()
const secretKey = z.string().max(256).optional()
const region = z.string().max(64).regex(/^[a-z0-9\-]+$/, 'Region must be lowercase alphanumeric with hyphens').optional()
const endpoint = z.string().max(512).url('Must be a valid URL').optional().or(z.literal(''))
const accountId = z.string().max(64).regex(/^[a-zA-Z0-9]+$/, 'Account ID must be alphanumeric').optional()

const providerSchema = z.object({
  provider: z.enum(['filesystem', 's3', 'r2', 'supabase-s3']),
  // AWS S3
  s3AccessKeyId: accessKeyId,
  s3SecretAccessKey: secretKey,
  s3Bucket: bucketName,
  s3Region: region,
  s3Endpoint: endpoint,
  // Cloudflare R2
  r2AccountId: accountId,
  r2AccessKeyId: accessKeyId,
  r2SecretAccessKey: secretKey,
  r2Bucket: bucketName,
  // Supabase Storage (S3-compatible)
  supabaseS3AccessKeyId: accessKeyId,
  supabaseS3SecretAccessKey: secretKey,
  supabaseS3Bucket: bucketName,
  supabaseS3Endpoint: endpoint,
  supabaseS3Region: region,
})

function mask(value: string | undefined): string | null {
  if (!value) return null
  if (value.length <= 8) return '••••••••'
  return value.slice(0, 4) + '••••••••' + value.slice(-4)
}

function encryptConfig(config: StorageConfig): StorageConfig {
  const encrypted = { ...config }
  for (const field of SENSITIVE_FIELDS) {
    const val = encrypted[field]
    if (val && !isEncrypted(val)) {
      encrypted[field] = encrypt(val)
    }
  }
  return encrypted
}

function maskConfig(config: StorageConfig): Record<string, unknown> {
  const masked: Record<string, unknown> = { provider: config.provider }
  for (const key of Object.keys(config) as (keyof StorageConfig)[]) {
    if (key === 'provider') continue
    if ((SENSITIVE_FIELDS as readonly string[]).includes(key)) {
      masked[key] = mask(config[key] as string | undefined)
    } else {
      masked[key] = config[key]
    }
  }
  return masked
}

export async function GET() {
  try {
    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return createErrorResponse('Unauthorized', 401)
    }

    const config = await readStorageConfig(withRLS)

    let status = 'active'
    if (config.provider === 'filesystem') {
      const absolutePath = resolve(process.cwd(), './data/storage/')
      status = existsSync(absolutePath) ? 'active' : 'not_configured'
    }

    return NextResponse.json({
      provider: config.provider,
      status,
      config: maskConfig(config),
    })
  } catch (error: unknown) {
    console.error('[Storage Settings GET]', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return createErrorResponse('Unauthorized', 401)
    }

    const validation = await validateRequestBody(request, providerSchema)
    if (!validation.success) {
      return validation.response
    }

    // Read existing config to preserve encrypted fields that weren't re-submitted
    // readStorageConfig returns decrypted values
    const existing = await readStorageConfig(withRLS)

    // Build new config — keep existing secrets if the field is empty/missing
    const newConfig: StorageConfig = { provider: validation.data.provider }
    for (const key of Object.keys(validation.data) as (keyof typeof validation.data)[]) {
      if (key === 'provider') continue
      const val = validation.data[key]
      if (typeof val === 'string' && val.length > 0) {
        (newConfig as any)[key] = val
      } else if (existing[key as keyof StorageConfig]) {
        (newConfig as any)[key] = existing[key as keyof StorageConfig]
      }
    }

    // Encrypt sensitive fields before storing
    const encrypted = encryptConfig(newConfig)
    await writeStorageConfig(withRLS, user.id, encrypted)
    clearProviderCache()

    return NextResponse.json({
      success: true,
      provider: validation.data.provider,
      config: maskConfig(newConfig),
    })
  } catch (error: unknown) {
    console.error('[Storage Settings POST]', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}
