/**
 * Extra coverage for documents/lib/utils.ts.
 *
 * Target: branch at line 158 — `parts.length > 1 ? ... : ''`
 * The false branch (filename without extension) is the one that returns ''.
 * The `|| ''` after pop()?.toUpperCase() is unreachable (pop() can't return
 * undefined when length > 1), so this is a V8 structural sub-expression branch.
 */
import { describe, it, expect } from 'vitest'
import { getFileExtension } from '@/modules-core/documents/lib/utils'

describe('getFileExtension extra', () => {
  it('returns empty string for a single-component filename (false branch of length>1)', () => {
    // When there's no dot, parts.length === 1, so returns '' (the false branch)
    expect(getFileExtension('README')).toBe('')
    expect(getFileExtension('dockerfile')).toBe('')
  })

  it('returns the uppercase extension when filename has an extension', () => {
    // parts.length > 1 (true branch), pop() returns 'ts', toUpperCase() → 'TS'
    expect(getFileExtension('component.ts')).toBe('TS')
  })
})
