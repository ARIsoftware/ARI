/**
 * Tests for health-data/lib/route-helpers.ts
 *
 * Mocks: @/lib/auth-helpers, @/lib/api-helpers, ./retention (getCompletedImport).
 * The function requires authentication and a completed import.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth-helpers', () => ({
  getAuthenticatedUser: vi.fn(),
}))

vi.mock('@/lib/api-helpers', () => ({
  createErrorResponse: vi.fn((message: string, status: number) => ({
    _mockResponse: true,
    message,
    status,
  })),
}))

vi.mock('@/modules-core/health-data/lib/retention', () => ({
  getCompletedImport: vi.fn(),
}))

// next/server NextResponse — only used by createErrorResponse which we mock
vi.mock('next/server', () => ({
  NextResponse: { json: vi.fn() },
}))

import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { createErrorResponse } from '@/lib/api-helpers'
import { getCompletedImport } from '@/modules-core/health-data/lib/retention'
import { requireHealthData } from '@/modules-core/health-data/lib/route-helpers'

const mockGetAuth = vi.mocked(getAuthenticatedUser)
const mockGetCompleted = vi.mocked(getCompletedImport)
const mockCreateError = vi.mocked(createErrorResponse)

describe('requireHealthData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when user is null', async () => {
    mockGetAuth.mockResolvedValue({ user: null, withRLS: null } as never)
    const result = await requireHealthData()
    expect(result.ok).toBe(false)
    expect(mockCreateError).toHaveBeenCalledWith(expect.stringContaining('Unauthorized'), 401)
  })

  it('returns 401 when withRLS is null', async () => {
    mockGetAuth.mockResolvedValue({ user: { id: 'u1' }, withRLS: null } as never)
    const result = await requireHealthData()
    expect(result.ok).toBe(false)
    expect(mockCreateError).toHaveBeenCalledWith(expect.stringContaining('Unauthorized'), 401)
  })

  it('returns 404 when no completed import', async () => {
    const fakeWithRLS = vi.fn()
    mockGetAuth.mockResolvedValue({ user: { id: 'u1' }, withRLS: fakeWithRLS } as never)
    mockGetCompleted.mockResolvedValue(null)
    const result = await requireHealthData()
    expect(result.ok).toBe(false)
    expect(mockCreateError).toHaveBeenCalledWith(expect.stringContaining('health data'), 404)
  })

  it('returns ok with context when user and completed import exist', async () => {
    const fakeWithRLS = vi.fn()
    const fakeImport = { id: 'imp-1', status: 'completed' }
    mockGetAuth.mockResolvedValue({ user: { id: 'u1' }, withRLS: fakeWithRLS } as never)
    mockGetCompleted.mockResolvedValue(fakeImport as never)
    const result = await requireHealthData()
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.ctx.user.id).toBe('u1')
      expect(result.ctx.withRLS).toBe(fakeWithRLS)
      expect(result.ctx.importRow).toBe(fakeImport)
    }
  })

  it('passes withRLS and userId to getCompletedImport', async () => {
    const fakeWithRLS = vi.fn()
    const fakeImport = { id: 'imp-2', status: 'completed' }
    mockGetAuth.mockResolvedValue({ user: { id: 'user-abc' }, withRLS: fakeWithRLS } as never)
    mockGetCompleted.mockResolvedValue(fakeImport as never)
    await requireHealthData()
    expect(mockGetCompleted).toHaveBeenCalledWith(fakeWithRLS, 'user-abc')
  })
})
