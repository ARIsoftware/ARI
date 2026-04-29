import type { StorageProvider, BucketConfig } from './types'
import { DEFAULT_BUCKET_CONFIG } from './types'
import { LocalFilesystemProvider } from './local'
import { S3StorageProvider } from './s3'
import type { StorageConfig } from './config'

export * from './types'
export { sanitizeFilename, sanitizeBucketName, validateStoredFilename } from './sanitize'
export { getMimeTypeForExtension } from './local'
export { readStorageConfig, writeStorageConfig, clearStorageConfigCache } from './config'
export type { StorageConfig } from './config'

let _filesystemProvider: StorageProvider | null = null
let _s3Provider: { provider: StorageProvider; key: string } | null = null

function s3CacheKey(config: StorageConfig): string {
  const bucket = config.s3Bucket || config.r2Bucket || config.supabaseS3Bucket
  const keyId = config.s3AccessKeyId || config.r2AccessKeyId || config.supabaseS3AccessKeyId
  const endpoint = config.s3Endpoint || config.supabaseS3Endpoint || config.r2AccountId
  return `${config.provider}:${bucket}:${keyId}:${endpoint}`
}

/** Clear cached provider instances (call when config changes) */
export function clearProviderCache(): void {
  _s3Provider = null
}

export function getStorageProvider(config: StorageConfig | string = 'filesystem'): StorageProvider {
  // Backward compat: accept a plain string (provider type)
  const providerType = typeof config === 'string' ? config : config.provider

  if (providerType === 'filesystem' || !providerType) {
    if (!_filesystemProvider) _filesystemProvider = new LocalFilesystemProvider()
    return _filesystemProvider
  }

  if (typeof config === 'string') {
    throw new Error(`Storage provider "${config}" requires full configuration. Pass the StorageConfig object.`)
  }

  // S3-compatible providers (AWS S3, Cloudflare R2, Supabase Storage S3)
  const key = s3CacheKey(config)
  if (_s3Provider && _s3Provider.key === key) return _s3Provider.provider

  let s3Config: { accessKeyId: string; secretAccessKey: string; bucket: string; region?: string; endpoint?: string }

  if (providerType === 's3') {
    if (!config.s3AccessKeyId || !config.s3SecretAccessKey || !config.s3Bucket) {
      throw new Error('AWS S3 storage requires Access Key ID, Secret Access Key, and Bucket Name. Configure in Settings > Storage.')
    }
    s3Config = {
      accessKeyId: config.s3AccessKeyId,
      secretAccessKey: config.s3SecretAccessKey,
      bucket: config.s3Bucket,
      region: config.s3Region,
      endpoint: config.s3Endpoint || undefined,
    }
  } else if (providerType === 'r2') {
    if (!config.r2AccessKeyId || !config.r2SecretAccessKey || !config.r2Bucket || !config.r2AccountId) {
      throw new Error('Cloudflare R2 storage requires Account ID, Access Key ID, Secret Access Key, and Bucket Name. Configure in Settings > Storage.')
    }
    s3Config = {
      accessKeyId: config.r2AccessKeyId,
      secretAccessKey: config.r2SecretAccessKey,
      bucket: config.r2Bucket,
      region: 'auto',
      endpoint: `https://${config.r2AccountId}.r2.cloudflarestorage.com`,
    }
  } else if (providerType === 'supabase-s3') {
    if (!config.supabaseS3AccessKeyId || !config.supabaseS3SecretAccessKey || !config.supabaseS3Bucket || !config.supabaseS3Endpoint) {
      throw new Error('Supabase Storage (S3) requires S3 Endpoint, Access Key ID, Secret Access Key, and Bucket Name. Configure in Settings > Storage.')
    }
    s3Config = {
      accessKeyId: config.supabaseS3AccessKeyId,
      secretAccessKey: config.supabaseS3SecretAccessKey,
      bucket: config.supabaseS3Bucket,
      region: config.supabaseS3Region || 'us-east-1',
      endpoint: config.supabaseS3Endpoint,
    }
  } else {
    throw new Error(`Unknown storage provider: "${providerType}". Supported: filesystem, s3, r2, supabase-s3`)
  }

  const provider = new S3StorageProvider(s3Config)
  _s3Provider = { provider, key }
  return provider
}

/** Returns true if running on Vercel with local filesystem storage (which won't persist) */
export function isStorageUnavailable(config: StorageConfig | string = 'filesystem'): boolean {
  const providerType = typeof config === 'string' ? config : config.provider
  return !!process.env.VERCEL && providerType === 'filesystem'
}

// Bucket config registry
const bucketConfigs = new Map<string, BucketConfig>()

export function registerBucket(name: string, config: Partial<BucketConfig>): void {
  bucketConfigs.set(name, { ...DEFAULT_BUCKET_CONFIG, ...config })
}

export function getBucketConfig(name: string): BucketConfig {
  return bucketConfigs.get(name) ?? DEFAULT_BUCKET_CONFIG
}
