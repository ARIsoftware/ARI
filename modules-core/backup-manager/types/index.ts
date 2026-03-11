// Backup Manager Types

export type StorageProvider = 'supabase' | 'r2' | 's3'

export interface BackupMetadata {
  id: string
  user_id: string
  filename: string
  storage_provider: StorageProvider
  storage_path: string
  size_bytes: number | null
  table_count: number | null
  row_count: number | null
  checksum: string | null
  created_at: string
  expires_at: string | null
}

export interface BackupManagerSettings {
  enabled: boolean                    // Auto-backup on/off
  storageProvider: StorageProvider
  retentionDays: number               // 7, 14, 30, 60, 90, or 0 (forever)
  lastBackupAt: string | null         // ISO timestamp

  // Provider-specific settings
  supabase?: {
    bucketName: string                // Default: 'ari-backups'
  }
  r2?: {
    bucketName: string                // Credentials from R2_* env vars
  }
  s3?: {
    bucketName: string                // Credentials from AWS_* env vars
    region: string
  }
}

export interface UserPreferences {
  id: string
  user_id: string
  name: string | null
  email: string | null
  title: string | null
  company_name: string | null
  country: string | null
  city: string | null
  linkedin_url: string | null
  timezone: string
  created_at: string
  updated_at: string
}

export interface SchedulingStatus {
  schedulingMode: 'vercel-cron' | 'app-triggered'
  scheduledTime: string
  limitation: string | null
  lastBackupAt: string | null
  nextBackupAt: string | null
}

export interface BackupCreateResult {
  success: boolean
  backup?: BackupMetadata
  error?: string
}

export interface BackupListResult {
  backups: BackupMetadata[]
  total: number
}

// Storage Provider Interface
export interface StorageProviderInterface {
  upload(filename: string, content: string): Promise<{ path: string; size: number }>
  download(path: string): Promise<string>
  delete(path: string): Promise<void>
  list(): Promise<{ path: string; size: number; createdAt: Date }[]>
  exists(path: string): Promise<boolean>
}

// Retention policy options
export const RETENTION_OPTIONS = [
  { value: 7, label: '7 days' },
  { value: 14, label: '14 days' },
  { value: 30, label: '30 days' },
  { value: 60, label: '60 days' },
  { value: 90, label: '90 days' },
  { value: 0, label: 'Forever' },
] as const

// Default settings
export const DEFAULT_BACKUP_SETTINGS: BackupManagerSettings = {
  enabled: false,
  storageProvider: 'supabase',
  retentionDays: 30,
  lastBackupAt: null,
  supabase: {
    bucketName: 'ari-backups',
  },
}

// Common timezones for the dropdown
export const COMMON_TIMEZONES = [
  { value: 'UTC', label: 'UTC (Coordinated Universal Time)' },
  { value: 'America/New_York', label: 'Eastern Time (US & Canada)' },
  { value: 'America/Chicago', label: 'Central Time (US & Canada)' },
  { value: 'America/Denver', label: 'Mountain Time (US & Canada)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (US & Canada)' },
  { value: 'America/Toronto', label: 'Toronto' },
  { value: 'America/Vancouver', label: 'Vancouver' },
  { value: 'Europe/London', label: 'London' },
  { value: 'Europe/Paris', label: 'Paris' },
  { value: 'Europe/Berlin', label: 'Berlin' },
  { value: 'Europe/Amsterdam', label: 'Amsterdam' },
  { value: 'Asia/Tokyo', label: 'Tokyo' },
  { value: 'Asia/Singapore', label: 'Singapore' },
  { value: 'Asia/Hong_Kong', label: 'Hong Kong' },
  { value: 'Asia/Shanghai', label: 'Shanghai' },
  { value: 'Asia/Dubai', label: 'Dubai' },
  { value: 'Asia/Jerusalem', label: 'Jerusalem' },
  { value: 'Australia/Sydney', label: 'Sydney' },
  { value: 'Australia/Melbourne', label: 'Melbourne' },
  { value: 'Pacific/Auckland', label: 'Auckland' },
  { value: 'Africa/Johannesburg', label: 'Johannesburg' },
] as const
