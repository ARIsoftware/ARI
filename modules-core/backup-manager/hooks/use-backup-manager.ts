'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useRef } from 'react'
import type { BackupMetadata, BackupManagerSettings, SchedulingStatus } from '../types'

// Query keys
const QUERY_KEYS = {
  settings: ['backup-manager', 'settings'] as const,
  backups: ['backup-manager', 'backups'] as const,
  status: ['backup-manager', 'status'] as const,
}

// Request timeout (5 minutes for backup operations)
const REQUEST_TIMEOUT = 5 * 60 * 1000

// Helper to create fetch with abort controller
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = 30000
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    })
    return response
  } finally {
    clearTimeout(timeoutId)
  }
}

// Fetch settings
async function fetchSettings(): Promise<BackupManagerSettings> {
  const response = await fetchWithTimeout('/api/modules/backup-manager/settings')
  if (!response.ok) {
    throw new Error('Failed to fetch backup settings')
  }
  return response.json()
}

// Save settings
async function saveSettings(settings: Partial<BackupManagerSettings>): Promise<BackupManagerSettings> {
  const response = await fetchWithTimeout(
    '/api/modules/backup-manager/settings',
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    }
  )
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to save backup settings')
  }
  return response.json()
}

// Fetch backup list
async function fetchBackups(): Promise<BackupMetadata[]> {
  const response = await fetchWithTimeout('/api/modules/backup-manager/list')
  if (!response.ok) {
    throw new Error('Failed to fetch backups')
  }
  const data = await response.json()
  return data.backups || []
}

// Create backup with idempotency key
async function createBackup(idempotencyKey?: string): Promise<BackupMetadata> {
  const headers: Record<string, string> = {}
  if (idempotencyKey) {
    headers['X-Idempotency-Key'] = idempotencyKey
  }

  const response = await fetchWithTimeout(
    '/api/modules/backup-manager/create',
    {
      method: 'POST',
      headers,
    },
    REQUEST_TIMEOUT
  )
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to create backup')
  }
  return response.json()
}

// Delete backup
async function deleteBackup(id: string): Promise<void> {
  const response = await fetchWithTimeout(`/api/modules/backup-manager/delete/${id}`, {
    method: 'DELETE',
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to delete backup')
  }
}

// Fetch scheduling status
async function fetchStatus(): Promise<SchedulingStatus> {
  const response = await fetchWithTimeout('/api/modules/backup-manager/status')
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
    staleTime: 30000, // Consider data fresh for 30 seconds
    retry: 2,
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
    staleTime: 10000, // Consider data fresh for 10 seconds
    retry: 2,
  })
}

export function useCreateBackup() {
  const queryClient = useQueryClient()
  // Track if a backup is in progress to prevent duplicate requests
  const isCreatingRef = useRef(false)

  return useMutation({
    mutationFn: async () => {
      // Prevent duplicate requests
      if (isCreatingRef.current) {
        throw new Error('Backup already in progress')
      }
      isCreatingRef.current = true
      try {
        // Generate idempotency key
        const idempotencyKey = `backup-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        return await createBackup(idempotencyKey)
      } finally {
        isCreatingRef.current = false
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.backups })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.status })
    },
    onError: () => {
      isCreatingRef.current = false
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
    staleTime: 60000, // Consider data fresh for 1 minute
    retry: 2,
  })
}

// Download backup helper with proper cleanup
export function useDownloadBackup() {
  const abortControllerRef = useRef<AbortController | null>(null)

  const downloadBackup = useCallback(async (id: string): Promise<void> => {
    // Cancel any previous download
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    abortControllerRef.current = new AbortController()
    let url: string | null = null

    try {
      const response = await fetch(`/api/modules/backup-manager/download/${id}`, {
        signal: abortControllerRef.current.signal,
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to download backup')
      }

      const blob = await response.blob()
      url = URL.createObjectURL(blob)

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
    } finally {
      // Cleanup object URL to prevent memory leak
      if (url) {
        // Delay revocation to ensure download starts
        setTimeout(() => {
          URL.revokeObjectURL(url!)
        }, 1000)
      }
      abortControllerRef.current = null
    }
  }, [])

  // Cleanup on unmount
  const cleanup = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
  }, [])

  return { downloadBackup, cleanup }
}

// Restore backup helper
export async function restoreBackup(id: string): Promise<{ success: boolean; message: string }> {
  const response = await fetchWithTimeout(
    `/api/modules/backup-manager/restore/${id}`,
    { method: 'POST' },
    REQUEST_TIMEOUT
  )
  const data = await response.json()
  if (!response.ok) {
    throw new Error(data.error || 'Failed to restore backup')
  }
  return data
}
