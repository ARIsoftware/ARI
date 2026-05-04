import { moduleSettings } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { decrypt, isEncrypted } from '@/lib/crypto'

const STORAGE_MODULE_ID = 'storage'

export const SENSITIVE_FIELDS: (keyof StorageConfig)[] = [
  's3SecretAccessKey',
  'r2SecretAccessKey',
  'supabaseS3SecretAccessKey',
]

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

/** Map StorageConfig fields to environment variable names */
const ENV_MAP: Record<keyof StorageConfig, string> = {
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

/** Read storage config from environment variables. Returns values for any env vars that are set. */
function readEnvConfig(): Partial<StorageConfig> {
  const env: Partial<StorageConfig> = {}
  for (const key of Object.keys(ENV_MAP) as (keyof StorageConfig)[]) {
    const val = process.env[ENV_MAP[key]]
    if (val) env[key] = val
  }
  return env
}

// In-memory cache — cleared on write, TTL 60s
let _cache: { config: StorageConfig; ts: number } | null = null
const CACHE_TTL = 60_000

export async function readStorageConfig(
  withRLS: <T>(op: (db: any) => Promise<T>) => Promise<T>
): Promise<StorageConfig> {
  if (_cache && Date.now() - _cache.ts < CACHE_TTL) {
    return _cache.config
  }

  // Read from database
  let dbConfig: StorageConfig = { ...DEFAULT_CONFIG }
  try {
    const rows = await withRLS<Array<{ settings: unknown }>>((db: any) =>
      db.select({ settings: moduleSettings.settings })
        .from(moduleSettings)
        .where(eq(moduleSettings.moduleId, STORAGE_MODULE_ID))
        .limit(1)
    )
    const settings = rows[0]?.settings as Record<string, unknown> | null
    if (settings) {
      dbConfig = { provider: (typeof settings.provider === 'string' && settings.provider) || 'filesystem' }
      for (const key of Object.keys(ENV_MAP) as (keyof StorageConfig)[]) {
        if (key === 'provider') continue
        const val = settings[key]
        if (typeof val === 'string') dbConfig[key] = val
      }
      // Decrypt sensitive fields
      for (const field of SENSITIVE_FIELDS) {
        const val = dbConfig[field]
        if (typeof val === 'string' && isEncrypted(val)) {
          try { dbConfig[field] = decrypt(val) } catch { delete dbConfig[field] }
        }
      }
    }
  } catch {
    // DB read failed — fall through to env vars / defaults
  }

  // Environment variables take precedence over DB values
  const envConfig = readEnvConfig()
  const config: StorageConfig = { ...dbConfig }
  for (const key of Object.keys(envConfig) as (keyof StorageConfig)[]) {
    if (envConfig[key]) config[key] = envConfig[key]
  }

  _cache = { config, ts: Date.now() }
  return config
}

export async function writeStorageConfig(
  withRLS: <T>(op: (db: any) => Promise<T>) => Promise<T>,
  userId: string,
  config: StorageConfig
): Promise<void> {
  await withRLS((db: any) =>
    db.insert(moduleSettings)
      .values({
        userId,
        moduleId: STORAGE_MODULE_ID,
        settings: config,
        enabled: true,
      })
      .onConflictDoUpdate({
        target: [moduleSettings.userId, moduleSettings.moduleId],
        set: {
          settings: config,
          updatedAt: new Date().toISOString(),
        },
      })
  )

  _cache = null
}

export function clearStorageConfigCache(): void {
  _cache = null
}
