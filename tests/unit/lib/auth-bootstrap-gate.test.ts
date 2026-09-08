/**
 * Tests for lib/auth-bootstrap-gate.ts — the auth-layer backstop that limits
 * Better Auth user creation to the first-run bootstrap's server-side call.
 */
import { describe, it, expect } from 'vitest'
import {
  isBootstrapUserCreateAllowed,
  withBootstrapUserCreate,
} from '@/lib/auth-bootstrap-gate'

describe('auth-bootstrap-gate', () => {
  it('is closed by default', () => {
    expect(isBootstrapUserCreateAllowed()).toBe(false)
  })

  it('is open only inside withBootstrapUserCreate and closes after', async () => {
    let openInside = false
    const result = await withBootstrapUserCreate(async () => {
      openInside = isBootstrapUserCreateAllowed()
      return 'ok'
    })
    expect(result).toBe('ok')
    expect(openInside).toBe(true)
    expect(isBootstrapUserCreateAllowed()).toBe(false)
  })

  it('closes even when the wrapped call throws', async () => {
    await expect(
      withBootstrapUserCreate(async () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    expect(isBootstrapUserCreateAllowed()).toBe(false)
  })

  it('stays open across nested/overlapping calls until the last one finishes', async () => {
    let resolveInner!: () => void
    const innerDone = new Promise<void>((r) => (resolveInner = r))
    const outer = withBootstrapUserCreate(async () => {
      const inner = withBootstrapUserCreate(async () => {
        await innerDone
      })
      // Both frames open.
      expect(isBootstrapUserCreateAllowed()).toBe(true)
      resolveInner()
      await inner
      // Inner closed, outer still open.
      expect(isBootstrapUserCreateAllowed()).toBe(true)
    })
    await outer
    expect(isBootstrapUserCreateAllowed()).toBe(false)
  })
})
