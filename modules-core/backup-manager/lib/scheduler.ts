// Backup Scheduler Utilities

/**
 * Check if a backup is due based on the user's timezone and last backup time.
 * Backups are scheduled for 12:00 PM in the user's local timezone.
 */
export function isBackupDue(
  lastBackupAt: string | null,
  userTimezone: string = 'UTC'
): { isDue: boolean; reason: string } {
  const now = new Date()

  // Get current time in user's timezone
  const userNow = new Date(now.toLocaleString('en-US', { timeZone: userTimezone }))
  const userHour = userNow.getHours()

  // Only check between 12:00 and 12:59 (noon hour)
  if (userHour !== 12) {
    return {
      isDue: false,
      reason: `Not backup hour (current hour: ${userHour}, scheduled: 12)`,
    }
  }

  // Check if we already have a backup today
  if (lastBackupAt) {
    const lastBackup = new Date(lastBackupAt)
    const lastBackupDate = new Date(
      lastBackup.toLocaleString('en-US', { timeZone: userTimezone })
    ).toDateString()
    const todayDate = userNow.toDateString()

    if (lastBackupDate === todayDate) {
      return {
        isDue: false,
        reason: 'Already backed up today',
      }
    }
  }

  return {
    isDue: true,
    reason: 'Scheduled backup time reached',
  }
}

/**
 * Check if a backup is overdue (for app-triggered mode).
 * Returns true if the last backup was more than 24 hours ago.
 */
export function isBackupOverdue(lastBackupAt: string | null): boolean {
  if (!lastBackupAt) {
    return true // No backup yet, so it's overdue
  }

  const lastBackup = new Date(lastBackupAt)
  const now = new Date()
  const hoursSinceLastBackup = (now.getTime() - lastBackup.getTime()) / (1000 * 60 * 60)

  return hoursSinceLastBackup >= 24
}

/**
 * Calculate the next scheduled backup time in the user's timezone.
 */
export function getNextBackupTime(
  lastBackupAt: string | null,
  userTimezone: string = 'UTC'
): Date {
  const now = new Date()

  // Get current time in user's timezone
  const userNow = new Date(now.toLocaleString('en-US', { timeZone: userTimezone }))
  const userHour = userNow.getHours()

  // Create a date for noon today in user's timezone
  const nextBackup = new Date(userNow)
  nextBackup.setHours(12, 0, 0, 0)

  // If it's already past noon, schedule for tomorrow
  if (userHour >= 12) {
    nextBackup.setDate(nextBackup.getDate() + 1)
  }

  return nextBackup
}

/**
 * Format a date in the user's timezone for display.
 */
export function formatInTimezone(date: Date, timezone: string): string {
  return date.toLocaleString('en-US', {
    timeZone: timezone,
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

/**
 * Get the scheduling mode based on environment.
 */
export function getSchedulingMode(): 'vercel-cron' | 'app-triggered' {
  return process.env.VERCEL === '1' ? 'vercel-cron' : 'app-triggered'
}

/**
 * Verify the request is from Vercel Cron (for the scheduled endpoint).
 */
export function isVercelCronRequest(headers: Headers): boolean {
  // Vercel sets this header for cron job requests
  const cronSecret = headers.get('x-vercel-cron-signature')
  const isFromVercel = headers.get('x-vercel-proxy-signature') !== null

  // In production, verify the request is from Vercel
  if (process.env.VERCEL === '1') {
    return isFromVercel || cronSecret !== null
  }

  // In development, allow all requests
  return true
}
