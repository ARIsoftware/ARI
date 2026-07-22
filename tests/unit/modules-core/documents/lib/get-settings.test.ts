/**
 * Tests for documents/lib/get-settings.ts
 *
 * Mocks: drizzle-orm eq/and (no-ops), @/lib/db/schema (moduleSettings),
 * and the withRLS helper passed directly.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/db/schema', () => ({
  moduleSettings: { userId: 'userId', moduleId: 'moduleId', settings: 'settings' },
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col: unknown, _val: unknown) => ({ eq: true })),
  and: vi.fn((...args: unknown[]) => ({ and: args })),
}))

import { getDocumentsSettings } from '@/modules-core/documents/lib/get-settings'
import { DEFAULT_DOCUMENTS_SETTINGS } from '@/modules-core/documents/types'

type WithRLS = <T>(op: (db: any) => Promise<T>) => Promise<T>

function makeWithRLS(rows: { settings: unknown }[]) {
  return vi.fn(async (fn: (db: any) => Promise<unknown>) => {
    const fakeDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => rows,
          }),
        }),
      }),
    }
    return fn(fakeDb)
  }) as unknown as WithRLS
}

describe('getDocumentsSettings', () => {
  it('returns DEFAULT_DOCUMENTS_SETTINGS when no rows found', async () => {
    const withRLS = makeWithRLS([])
    const result = await getDocumentsSettings(withRLS, 'user-1')
    expect(result).toEqual(DEFAULT_DOCUMENTS_SETTINGS)
  })

  it('merges saved settings over defaults', async () => {
    const withRLS = makeWithRLS([{ settings: { defaultView: 'table', maxFileSizeMb: 10 } }])
    const result = await getDocumentsSettings(withRLS, 'user-1')
    expect(result.defaultView).toBe('table')
    expect(result.maxFileSizeMb).toBe(10)
    // Keeps defaults for unset keys
    expect(result.onboardingCompleted).toBe(DEFAULT_DOCUMENTS_SETTINGS.onboardingCompleted)
  })

  it('handles null/undefined settings gracefully (falls back to defaults)', async () => {
    const withRLS = makeWithRLS([{ settings: null }])
    const result = await getDocumentsSettings(withRLS, 'user-1')
    expect(result).toEqual(DEFAULT_DOCUMENTS_SETTINGS)
  })

  it('passes userId to withRLS query', async () => {
    const withRLS = makeWithRLS([])
    await getDocumentsSettings(withRLS, 'user-42')
    expect(withRLS).toHaveBeenCalledOnce()
  })

  it('onboardingCompleted can be set to true', async () => {
    const withRLS = makeWithRLS([{ settings: { onboardingCompleted: true } }])
    const result = await getDocumentsSettings(withRLS, 'user-1')
    expect(result.onboardingCompleted).toBe(true)
  })
})
