/**
 * Extra coverage for documents/lib/providers/index.ts.
 *
 * Targets:
 * - line 50 in constructProvider: the `default: throw` branch for unknown provider
 * - branch 40: getStorageProvider with a new provider key (cache miss → hit)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/storage', () => ({
  readStorageConfig: vi.fn(() => ({ provider: 'filesystem' })),
}))

vi.mock('@/modules-core/documents/lib/providers/supabase', () => ({
  SupabaseStorageProvider: vi.fn(function (bucket?: string) {
    return { _type: 'supabase', _bucket: bucket }
  }),
}))

vi.mock('@/modules-core/documents/lib/providers/r2', () => ({
  R2StorageProvider: vi.fn(function (bucket?: string) {
    return { _type: 'r2', _bucket: bucket }
  }),
}))

vi.mock('@/modules-core/documents/lib/providers/s3', () => ({
  S3StorageProvider: vi.fn(function (bucket?: string) {
    return { _type: 's3', _bucket: bucket }
  }),
}))

vi.mock('@/modules-core/documents/lib/providers/local', () => ({
  LocalFilesystemProvider: vi.fn(function (bucket?: string) {
    return { _type: 'local', _bucket: bucket }
  }),
  LOCAL_BUCKET: 'documents',
}))

import {
  getStorageProvider,
} from '@/modules-core/documents/lib/providers/index'

describe('constructProvider — unknown provider throws', () => {
  it('throws for an unknown provider type via getStorageProvider', () => {
    expect(() => getStorageProvider('unknown-provider' as never))
      .toThrow(/Unknown storage provider/)
  })
})
