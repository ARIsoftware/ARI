import type { StorageProvider, BucketConfig } from './types'
import { DEFAULT_BUCKET_CONFIG } from './types'
import { LocalFilesystemProvider } from './local'

export * from './types'
export { sanitizeFilename, sanitizeBucketName, validateStoredFilename } from './sanitize'
export { getMimeTypeForExtension } from './local'

let _provider: StorageProvider | null = null

export function getStorageProvider(): StorageProvider {
  if (_provider) return _provider
  // Future: check process.env.ARI_STORAGE_PROVIDER for 'supabase', 's3', etc.
  _provider = new LocalFilesystemProvider()
  return _provider
}

// Bucket config registry
const bucketConfigs = new Map<string, BucketConfig>()

export function registerBucket(name: string, config: Partial<BucketConfig>): void {
  bucketConfigs.set(name, { ...DEFAULT_BUCKET_CONFIG, ...config })
}

export function getBucketConfig(name: string): BucketConfig {
  return bucketConfigs.get(name) ?? DEFAULT_BUCKET_CONFIG
}
