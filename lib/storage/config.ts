export interface StorageConfig {
  provider: string  // 'filesystem' | 's3' | 'r2' | 'supabase-s3'
  // AWS S3
  s3AccessKeyId?: string
  s3SecretAccessKey?: string
  s3Bucket?: string
  s3Region?: string
  s3Endpoint?: string
  // Cloudflare R2
  r2AccountId?: string
  r2AccessKeyId?: string
  r2SecretAccessKey?: string
  r2Bucket?: string
  // Supabase Storage (S3-compatible)
  supabaseS3AccessKeyId?: string
  supabaseS3SecretAccessKey?: string
  supabaseS3Bucket?: string
  supabaseS3Endpoint?: string
  supabaseS3Region?: string
}

const DEFAULT_CONFIG: StorageConfig = { provider: 'filesystem' }

/** Human-readable labels for each storage provider. */
export const PROVIDER_LABELS: Record<string, string> = {
  filesystem: 'Local Filesystem',
  s3: 'AWS S3',
  r2: 'Cloudflare R2',
  'supabase-s3': 'Supabase Storage (S3)',
}

/** Map StorageConfig fields to environment variable names */
export const ENV_MAP: Record<keyof StorageConfig, string> = {
  provider: 'ARI_STORAGE_PROVIDER',
  s3AccessKeyId: 'ARI_S3_ACCESS_KEY_ID',
  s3SecretAccessKey: 'ARI_S3_SECRET_ACCESS_KEY',
  s3Bucket: 'ARI_S3_BUCKET',
  s3Region: 'ARI_S3_REGION',
  s3Endpoint: 'ARI_S3_ENDPOINT',
  r2AccountId: 'ARI_R2_ACCOUNT_ID',
  r2AccessKeyId: 'ARI_R2_ACCESS_KEY_ID',
  r2SecretAccessKey: 'ARI_R2_SECRET_ACCESS_KEY',
  r2Bucket: 'ARI_R2_BUCKET',
  supabaseS3AccessKeyId: 'ARI_SUPABASE_S3_ACCESS_KEY_ID',
  supabaseS3SecretAccessKey: 'ARI_SUPABASE_S3_SECRET_ACCESS_KEY',
  supabaseS3Bucket: 'ARI_SUPABASE_S3_BUCKET',
  supabaseS3Endpoint: 'ARI_SUPABASE_S3_ENDPOINT',
  supabaseS3Region: 'ARI_SUPABASE_S3_REGION',
}

/**
 * Read storage config from environment variables only.
 *
 * Source of truth: `.env.local` (or platform env, e.g. Vercel).
 * - `ARI_STORAGE_PROVIDER` selects the backend: 'filesystem' (default) | 's3' | 'r2' | 'supabase-s3'.
 * - `ARI_S3_*`, `ARI_R2_*`, `ARI_SUPABASE_S3_*` provide credentials for the chosen backend.
 *
 * Modules that need provider-aware behavior can read `process.env.ARI_STORAGE_PROVIDER` directly.
 */
export function readStorageConfig(): StorageConfig {
  const config: StorageConfig = { ...DEFAULT_CONFIG }
  for (const key of Object.keys(ENV_MAP) as (keyof StorageConfig)[]) {
    const val = process.env[ENV_MAP[key]]
    if (val) config[key] = val
  }
  return config
}
