// Backup Retention Policy Utilities

import type { BackupMetadata, BackupManagerSettings } from '../types'
import { getStorageProvider } from './providers'

/**
 * Calculate the expiration date for a backup based on retention policy.
 * Returns null if retention is set to forever (0 days).
 */
export function calculateExpirationDate(
  createdAt: Date,
  retentionDays: number
): Date | null {
  if (retentionDays === 0) {
    return null // Forever
  }

  const expirationDate = new Date(createdAt)
  expirationDate.setDate(expirationDate.getDate() + retentionDays)
  return expirationDate
}

/**
 * Check if a backup has expired based on its expiration date.
 */
export function isBackupExpired(backup: BackupMetadata): boolean {
  if (!backup.expires_at) {
    return false // No expiration = forever
  }

  const expirationDate = new Date(backup.expires_at)
  const now = new Date()

  return now > expirationDate
}

/**
 * Filter backups that have expired and should be cleaned up.
 */
export function getExpiredBackups(backups: BackupMetadata[]): BackupMetadata[] {
  return backups.filter(isBackupExpired)
}

/**
 * Clean up expired backups from storage and database.
 * Returns the number of backups cleaned up.
 */
export async function cleanupExpiredBackups(
  backups: BackupMetadata[],
  settings: BackupManagerSettings,
  deleteFromDatabase: (id: string) => Promise<void>
): Promise<{ cleaned: number; errors: string[] }> {
  const expiredBackups = getExpiredBackups(backups)
  const errors: string[] = []
  let cleaned = 0

  if (expiredBackups.length === 0) {
    return { cleaned: 0, errors: [] }
  }

  const provider = getStorageProvider(settings.storageProvider, settings)

  for (const backup of expiredBackups) {
    try {
      // Delete from storage
      await provider.delete(backup.storage_path)

      // Delete from database
      await deleteFromDatabase(backup.id)

      cleaned++
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      errors.push(`Failed to clean up backup ${backup.id}: ${errorMessage}`)
    }
  }

  return { cleaned, errors }
}

/**
 * Get retention policy label for display.
 */
export function getRetentionLabel(days: number): string {
  if (days === 0) return 'Forever'
  if (days === 1) return '1 day'
  return `${days} days`
}

/**
 * Format bytes to human-readable size.
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes'

  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

/**
 * Get human-readable time until expiration.
 */
export function getTimeUntilExpiration(expiresAt: string | null): string {
  if (!expiresAt) return 'Never'

  const expiration = new Date(expiresAt)
  const now = new Date()
  const diff = expiration.getTime() - now.getTime()

  if (diff <= 0) return 'Expired'

  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))

  if (days > 0) {
    return days === 1 ? '1 day' : `${days} days`
  }
  if (hours > 0) {
    return hours === 1 ? '1 hour' : `${hours} hours`
  }
  return 'Less than an hour'
}
