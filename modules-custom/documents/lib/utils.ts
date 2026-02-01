/**
 * Documents Module - Utility Functions
 */

import {
  File,
  FileText,
  FileImage,
  FileVideo,
  FileAudio,
  FileCode,
  FileArchive,
  FileSpreadsheet,
  Folder,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/**
 * Get appropriate icon for a file based on its MIME type
 */
export function getFileIcon(mimeType: string): LucideIcon {
  if (mimeType.startsWith('image/')) return FileImage
  if (mimeType.startsWith('video/')) return FileVideo
  if (mimeType.startsWith('audio/')) return FileAudio

  // Documents
  if (
    mimeType === 'application/pdf' ||
    mimeType === 'application/msword' ||
    mimeType.includes('wordprocessingml') ||
    mimeType === 'text/plain' ||
    mimeType === 'text/markdown'
  ) {
    return FileText
  }

  // Spreadsheets
  if (
    mimeType === 'text/csv' ||
    mimeType.includes('spreadsheet') ||
    mimeType === 'application/vnd.ms-excel'
  ) {
    return FileSpreadsheet
  }

  // Code
  if (
    mimeType.includes('javascript') ||
    mimeType.includes('typescript') ||
    mimeType === 'application/json' ||
    mimeType === 'text/html' ||
    mimeType === 'text/css' ||
    mimeType === 'text/x-python' ||
    mimeType === 'application/xml'
  ) {
    return FileCode
  }

  // Archives
  if (
    mimeType.includes('zip') ||
    mimeType.includes('rar') ||
    mimeType.includes('7z') ||
    mimeType.includes('tar') ||
    mimeType.includes('gzip')
  ) {
    return FileArchive
  }

  return File
}

/**
 * Format file size in human-readable format
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const k = 1024
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + units[i]
}

/**
 * Format date in a human-readable format
 */
export function formatDate(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diff = now.getTime() - date.getTime()

  // Less than 24 hours ago
  if (diff < 24 * 60 * 60 * 1000) {
    const hours = Math.floor(diff / (60 * 60 * 1000))
    if (hours === 0) {
      const minutes = Math.floor(diff / (60 * 1000))
      return minutes <= 1 ? 'Just now' : `${minutes} minutes ago`
    }
    return hours === 1 ? '1 hour ago' : `${hours} hours ago`
  }

  // Less than 7 days ago
  if (diff < 7 * 24 * 60 * 60 * 1000) {
    const days = Math.floor(diff / (24 * 60 * 60 * 1000))
    return days === 1 ? 'Yesterday' : `${days} days ago`
  }

  // Otherwise show date
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

/**
 * Check if a file is an image that can be previewed
 */
export function isPreviewableImage(mimeType: string): boolean {
  return ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'].includes(mimeType)
}

/**
 * Get file extension from filename
 */
export function getFileExtension(filename: string): string {
  const parts = filename.split('.')
  return parts.length > 1 ? parts.pop()?.toUpperCase() || '' : ''
}

/**
 * Truncate filename if too long
 */
export function truncateFilename(filename: string, maxLength: number = 30): string {
  if (filename.length <= maxLength) return filename

  const ext = filename.includes('.') ? '.' + filename.split('.').pop() : ''
  const nameWithoutExt = ext ? filename.slice(0, -ext.length) : filename
  const truncatedName = nameWithoutExt.slice(0, maxLength - ext.length - 3) + '...'

  return truncatedName + ext
}

/**
 * Build breadcrumb path from folder hierarchy
 */
export function buildBreadcrumbPath(
  folders: { id: string; name: string; parent_id: string | null }[],
  currentFolderId: string | null
): { id: string | null; name: string }[] {
  const path: { id: string | null; name: string }[] = [{ id: null, name: 'Documents' }]

  if (!currentFolderId) return path

  const folderMap = new Map(folders.map((f) => [f.id, f]))

  const buildPath = (folderId: string | null) => {
    if (!folderId) return
    const folder = folderMap.get(folderId)
    if (!folder) return

    buildPath(folder.parent_id)
    path.push({ id: folder.id, name: folder.name })
  }

  buildPath(currentFolderId)

  return path
}
