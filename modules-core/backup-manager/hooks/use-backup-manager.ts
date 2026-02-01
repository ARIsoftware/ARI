'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { BackupMetadata, BackupManagerSettings, SchedulingStatus } from '../types'

// Query keys
const QUERY_KEYS = {
  settings: ['backup-manager', 'settings'] as const,
  backups: ['backup-manager', 'backups'] as const,
  status: ['backup-manager', 'status'] as const,
}

// Fetch settings
async function fetchSettings(): Promise<BackupManagerSettings> {
  const response = await fetch('/api/modules/backup-manager/settings')
  if (!response.ok) {
    throw new Error('Failed to fetch backup settings')
  }
  return response.json()
}

// Save settings
async function saveSettings(settings: Partial<BackupManagerSettings>): Promise<BackupManagerSettings> {
  const response = await fetch('/api/modules/backup-manager/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to save backup settings')
  }
  return response.json()
}

// Fetch backup list
async function fetchBackups(): Promise<BackupMetadata[]> {
  const response = await fetch('/api/modules/backup-manager/list')
  if (!response.ok) {
    throw new Error('Failed to fetch backups')
  }
  const data = await response.json()
  return data.backups || []
}

// Create backup
async function createBackup(): Promise<BackupMetadata> {
  const response = await fetch('/api/modules/backup-manager/create', {
    method: 'POST',
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to create backup')
  }
  return response.json()
}

// Delete backup
async function deleteBackup(id: string): Promise<void> {
  const response = await fetch(`/api/modules/backup-manager/delete/${id}`, {
    method: 'DELETE',
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to delete backup')
  }
}

// Fetch scheduling status
async function fetchStatus(): Promise<SchedulingStatus> {
  const response = await fetch('/api/modules/backup-manager/status')
  if (!response.ok) {
    throw new Error('Failed to fetch scheduling status')
  }
  return response.json()
}

// Hooks

export function useBackupSettings() {
  return useQuery({
    queryKey: QUERY_KEYS.settings,
    queryFn: fetchSettings,
  })
}

export function useSaveBackupSettings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: saveSettings,
    onSuccess: (data) => {
      queryClient.setQueryData(QUERY_KEYS.settings, data)
    },
  })
}

export function useBackupList() {
  return useQuery({
    queryKey: QUERY_KEYS.backups,
    queryFn: fetchBackups,
  })
}

export function useCreateBackup() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: createBackup,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.backups })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.status })
    },
  })
}

export function useDeleteBackup() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deleteBackup,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.backups })
    },
  })
}

export function useSchedulingStatus() {
  return useQuery({
    queryKey: QUERY_KEYS.status,
    queryFn: fetchStatus,
  })
}

// Download backup helper (returns a URL to download)
export async function downloadBackup(id: string): Promise<void> {
  const response = await fetch(`/api/modules/backup-manager/download/${id}`)
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to download backup')
  }

  const blob = await response.blob()
  const url = URL.createObjectURL(blob)

  // Get filename from content-disposition header or generate one
  const contentDisposition = response.headers.get('Content-Disposition')
  let filename = 'backup.sql'
  if (contentDisposition) {
    const match = contentDisposition.match(/filename="(.+)"/)
    if (match) filename = match[1]
  }

  // Trigger download
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// Restore backup helper
export async function restoreBackup(id: string): Promise<{ success: boolean; message: string }> {
  const response = await fetch(`/api/modules/backup-manager/restore/${id}`, {
    method: 'POST',
  })
  const data = await response.json()
  if (!response.ok) {
    throw new Error(data.error || 'Failed to restore backup')
  }
  return data
}
