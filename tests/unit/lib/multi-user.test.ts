/**
 * Tests for lib/multi-user.ts — isMultiUserInstall().
 * The generated manifest is mocked so the result doesn't depend on which
 * modules happen to be installed in the working tree.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

beforeEach(() => {
  vi.resetModules()
})

async function loadWithModules(ids: string[]) {
  vi.doMock('@/lib/generated/module-manifest.json', () => ({
    default: { modules: ids.map((id) => ({ id })) },
  }))
  return import('@/lib/multi-user')
}

describe('isMultiUserInstall()', () => {
  it('returns true when the ari-users module is installed', async () => {
    const { isMultiUserInstall } = await loadWithModules(['tasks', 'ari-users', 'quotes'])
    expect(isMultiUserInstall()).toBe(true)
  })

  it('returns false when the ari-users module is absent', async () => {
    const { isMultiUserInstall } = await loadWithModules(['tasks', 'quotes'])
    expect(isMultiUserInstall()).toBe(false)
  })

  it('returns false for an empty module list', async () => {
    const { isMultiUserInstall } = await loadWithModules([])
    expect(isMultiUserInstall()).toBe(false)
  })
})
