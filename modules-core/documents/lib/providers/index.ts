// Storage Provider Interface and Factory for Documents Module
//
// Provider selection is driven by ARI_STORAGE_PROVIDER (read via ARI's
// central /lib/storage). The documents module does not persist its own
// per-user provider choice anymore — the same provider that powers every
// other ARI module powers documents too.

import type { StorageProviderInterface, StorageProvider } from '../../types'
import { REQUIRED_ENV_VARS } from '../../types'
import { readStorageConfig } from '@/lib/storage'
import { SupabaseStorageProvider } from './supabase'
import { R2StorageProvider } from './r2'
import { S3StorageProvider } from './s3'
import { LocalFilesystemProvider, LOCAL_BUCKET } from './local'

/**
 * Resolve the currently active documents storage provider name from
 * ARI_STORAGE_PROVIDER. Maps ARI's central provider names onto the names
 * used in the documents module's `Document.storage_provider` column.
 */
export function getActiveProvider(): StorageProvider {
  const ariProvider = readStorageConfig().provider
  switch (ariProvider) {
    case 's3': return 's3'
    case 'r2': return 'r2'
    case 'supabase-s3': return 'supabase'
    default: return 'local'
  }
}

// Module-scoped cache so repeated calls within and across requests reuse the
// same provider instance (and the same underlying S3Client). Env vars only
// change on process restart, so we never have to invalidate.
const providerCache = new Map<string, StorageProviderInterface>()

function constructProvider(
  provider: StorageProvider,
  bucketOverride?: string
): StorageProviderInterface {
  switch (provider) {
    case 'supabase':
      return new SupabaseStorageProvider(bucketOverride)
    case 'r2':
      return new R2StorageProvider(bucketOverride)
    case 's3':
      return new S3StorageProvider(bucketOverride)
    case 'local':
      return new LocalFilesystemProvider(bucketOverride)
    default:
      throw new Error(`Unknown storage provider: ${provider}`)
  }
}

export function getStorageProvider(
  provider: StorageProvider,
  bucketOverride?: string | null
): StorageProviderInterface {
  const override = bucketOverride || undefined
  const key = `${provider}:${override ?? ''}`
  let instance = providerCache.get(key)
  if (!instance) {
    instance = constructProvider(provider, override)
    providerCache.set(key, instance)
  }
  return instance
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required env var for documents storage: ${name}`)
  }
  return value
}

/**
 * Resolve the bucket that a new upload should land in for the active provider.
 * Stored alongside the document so future reads aren't broken by later
 * env changes.
 */
export function getCurrentBucket(provider: StorageProvider): string {
  switch (provider) {
    case 'supabase':
      return requireEnv('ARI_SUPABASE_S3_BUCKET')
    case 'r2':
      return requireEnv('ARI_R2_BUCKET')
    case 's3':
      return requireEnv('ARI_S3_BUCKET')
    case 'local':
      return LOCAL_BUCKET
  }
}

export function isProviderConfigured(
  provider: StorageProvider
): { configured: boolean; missing: string[] } {
  const required = REQUIRED_ENV_VARS[provider] as readonly string[]
  const missing = required.filter((name) => !process.env[name])
  return { configured: missing.length === 0, missing }
}

export { SupabaseStorageProvider } from './supabase'
export { R2StorageProvider } from './r2'
export { S3StorageProvider } from './s3'
export { LocalFilesystemProvider, LOCAL_BUCKET } from './local'
