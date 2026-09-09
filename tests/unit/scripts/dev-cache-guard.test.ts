import { describe, expect, it } from 'vitest'
// Relative import: the guard lives in scripts/ (outside the @/ alias scope) and
// is plain ESM JS — tsconfig allowJs resolves it.
import { isGraphShaping, isStaleMiddlewareShim } from '../../../scripts/dev-cache-guard.mjs'

describe('isGraphShaping', () => {
  it('fires for convention entrypoints at the repo root', () => {
    expect(isGraphShaping(['proxy.ts'])).toBe('proxy.ts')
    expect(isGraphShaping(['middleware.ts'])).toBe('middleware.ts')
    expect(isGraphShaping(['instrumentation.ts'])).toBe('instrumentation.ts')
  })

  it('fires for dependency and config files', () => {
    expect(isGraphShaping(['pnpm-lock.yaml'])).toBe('pnpm-lock.yaml')
    expect(isGraphShaping(['package.json'])).toBe('package.json')
    expect(isGraphShaping(['next.config.mjs'])).toBe('next.config.mjs')
    expect(isGraphShaping(['tsconfig.json'])).toBe('tsconfig.json')
  })

  it('returns the first hit among mixed paths', () => {
    expect(isGraphShaping(['README.md', 'proxy.ts', 'package.json'])).toBe('proxy.ts')
  })

  it('ignores ordinary source and docs changes', () => {
    expect(isGraphShaping(['README.md'])).toBeNull()
    expect(isGraphShaping(['app/page.tsx'])).toBeNull()
    expect(isGraphShaping(['lib/auth-helpers.ts'])).toBeNull()
    expect(isGraphShaping([])).toBeNull()
  })

  it('only matches exact root-relative paths, never nested files', () => {
    expect(isGraphShaping(['modules-core/foo/package.json'])).toBeNull()
    expect(isGraphShaping(['docs/tsconfig.json'])).toBeNull()
  })
})

describe('isStaleMiddlewareShim', () => {
  const staleChunk = 'R.m("[project]/middleware.ts [middleware] (ecmascript)")'
  const healthyChunk = 'R.m("[project]/proxy.ts [middleware] (ecmascript)")'

  it('detects a compiled chunk referencing the removed middleware.ts', () => {
    expect(isStaleMiddlewareShim(staleChunk, false)).toBe(true)
  })

  it('is not stale while middleware.ts still exists', () => {
    expect(isStaleMiddlewareShim(staleChunk, true)).toBe(false)
  })

  it('is not stale for a healthy proxy.ts-referencing chunk', () => {
    expect(isStaleMiddlewareShim(healthyChunk, false)).toBe(false)
  })

  it('is not stale for empty content', () => {
    expect(isStaleMiddlewareShim('', false)).toBe(false)
  })
})
