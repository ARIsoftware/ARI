import { describe, expect, it } from 'vitest'
import {
  GRAPH_SHAPING_FILES,
  firstChangedFile,
  isStaleMiddlewareShim,
  normalizePackageJson,
} from '@/scripts/dev-cache-guard.mjs'

describe('GRAPH_SHAPING_FILES', () => {
  it('contains only exact root-relative paths', () => {
    for (const name of GRAPH_SHAPING_FILES) {
      expect(name).not.toContain('/')
    }
    expect(GRAPH_SHAPING_FILES).toContain('proxy.ts')
    expect(GRAPH_SHAPING_FILES).toContain('middleware.ts')
    expect(GRAPH_SHAPING_FILES).toContain('pnpm-lock.yaml')
  })
})

describe('normalizePackageJson', () => {
  it('strips the version field so release bumps hash identically', () => {
    const a = normalizePackageJson('{"name":"ari","version":"2.0.5","type":"module"}')
    const b = normalizePackageJson('{"name":"ari","version":"2.0.6","type":"module"}')
    expect(a).toBe(b)
  })

  it('still distinguishes genuinely graph-shaping edits', () => {
    const a = normalizePackageJson('{"name":"ari","version":"2.0.5","type":"module"}')
    const b = normalizePackageJson('{"name":"ari","version":"2.0.5","type":"commonjs"}')
    expect(a).not.toBe(b)
  })

  it('returns malformed input as-is instead of throwing', () => {
    expect(normalizePackageJson('not json {')).toBe('not json {')
  })
})

describe('firstChangedFile', () => {
  const base = { 'proxy.ts': 'aaa', 'package.json': 'bbb' }

  it('returns null when hashes match', () => {
    expect(firstChangedFile(base, { ...base })).toBeNull()
  })

  it('reports a changed file', () => {
    expect(firstChangedFile(base, { ...base, 'package.json': 'ccc' })).toBe('package.json')
  })

  it('reports a file that disappeared (entrypoint rename)', () => {
    expect(firstChangedFile(base, { 'package.json': 'bbb' })).toBe('proxy.ts')
  })

  it('reports a file that appeared', () => {
    expect(firstChangedFile(base, { ...base, 'middleware.ts': 'ddd' })).toBe('middleware.ts')
  })

  it('ignores keys outside the graph-shaping list', () => {
    expect(firstChangedFile(base, { ...base, 'README.md': 'zzz' })).toBeNull()
  })

  it('tolerates missing maps', () => {
    expect(firstChangedFile(undefined, base)).toBe('proxy.ts')
    expect(firstChangedFile(base, undefined)).toBe('proxy.ts')
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
