'use client'

import { useEffect, useRef } from 'react'
import { useBackupSettings, useCreateBackup } from '../hooks/use-backup-manager'
import { isBackupOverdue } from '../lib/scheduler'

/**
 * BackupTrigger Component
 *
 * This component runs in the background and triggers automatic backups
 * when the app is loaded and a backup is overdue (for app-triggered mode).
 *
 * It's only active when NOT running on Vercel (where cron handles backups).
 */
export function BackupTrigger() {
  const hasTriggered = useRef(false)
  const { data: settings, isLoading } = useBackupSettings()
  const createBackup = useCreateBackup()

  useEffect(() => {
    // Skip if on Vercel - cron handles backups there
    if (process.env.NEXT_PUBLIC_VERCEL === '1') {
      return
    }

    // Skip if already triggered this session
    if (hasTriggered.current) {
      return
    }

    // Skip if still loading settings
    if (isLoading || !settings) {
      return
    }

    // Skip if backups are disabled
    if (!settings.enabled) {
      return
    }

    // Check if backup is overdue
    if (!isBackupOverdue(settings.lastBackupAt)) {
      return
    }

    // Mark as triggered to prevent multiple triggers
    hasTriggered.current = true

    // Trigger backup in background (fire and forget)
    createBackup.mutate(undefined, {
      onSuccess: () => {
        console.log('[BackupTrigger] Automatic backup created successfully')
      },
      onError: (error) => {
        console.error('[BackupTrigger] Automatic backup failed:', error)
      },
    })
  }, [settings, isLoading, createBackup])

  // This component renders nothing
  return null
}
