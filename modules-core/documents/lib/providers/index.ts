// Storage Provider Interface and Factory for Documents Module

import type { StorageProviderInterface, StorageProvider, DocumentsSettings } from '../../types'
import { SupabaseStorageProvider } from './supabase'
import { R2StorageProvider } from './r2'
import { S3StorageProvider } from './s3'

export function getStorageProvider(
  settings: DocumentsSettings
): StorageProviderInterface {
  const provider = settings.storageProvider

  switch (provider) {
    case 'supabase':
      return new SupabaseStorageProvider(settings.supabase?.bucketName || 'ari-documents')
    case 'r2':
      if (!settings.r2?.bucketName) {
        throw new Error('R2 bucket name is required')
      }
      return new R2StorageProvider(settings.r2.bucketName)
    case 's3':
      if (!settings.s3?.bucketName || !settings.s3?.region) {
        throw new Error('S3 bucket name and region are required')
      }
      return new S3StorageProvider(settings.s3.bucketName, settings.s3.region)
    default:
      throw new Error(`Unknown storage provider: ${provider}`)
  }
}

export function isProviderConfigured(provider: StorageProvider): { configured: boolean; missing: string[] } {
  const missing: string[] = []

  switch (provider) {
    case 'supabase':
      if (!process.env.NEXT_PUBLIC_SUPABASE_URL) missing.push('NEXT_PUBLIC_SUPABASE_URL')
      if (!process.env.SUPABASE_SECRET_KEY) missing.push('SUPABASE_SECRET_KEY')
      break
    case 'r2':
      if (!process.env.R2_ACCOUNT_ID) missing.push('R2_ACCOUNT_ID')
      if (!process.env.R2_ACCESS_KEY_ID) missing.push('R2_ACCESS_KEY_ID')
      if (!process.env.R2_SECRET_ACCESS_KEY) missing.push('R2_SECRET_ACCESS_KEY')
      break
    case 's3':
      if (!process.env.AWS_ACCESS_KEY_ID) missing.push('AWS_ACCESS_KEY_ID')
      if (!process.env.AWS_SECRET_ACCESS_KEY) missing.push('AWS_SECRET_ACCESS_KEY')
      break
  }

  return { configured: missing.length === 0, missing }
}

export { SupabaseStorageProvider } from './supabase'
export { R2StorageProvider } from './r2'
export { S3StorageProvider } from './s3'
