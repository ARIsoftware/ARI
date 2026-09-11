import { describe, expect, it } from 'vitest'
import {
  isReadableRange,
  parseVersion,
  rangeAnchor,
  satisfies,
} from '@/scripts/lib/semver-range.js'

describe('parseVersion', () => {
  it.each([
    ['1.2.3', [1, 2, 3]],
    ['v1.2.3', [1, 2, 3]],
    ['1.2', [1, 2, 0]],
    ['1', [1, 0, 0]],
    ['1.2.3-beta.1', [1, 2, 3]],
    ['1.2.3+build5', [1, 2, 3]],
  ])('parses %s', (input, expected) => {
    expect(parseVersion(input)).toEqual(expected)
  })

  it.each([['1.2.3.4'], ['1.x'], ['abc'], [''], ['>=1.0.0']])('rejects %s', (input) => {
    expect(parseVersion(input)).toBeNull()
  })

  it('rejects non-strings', () => {
    expect(parseVersion(undefined as unknown as string)).toBeNull()
  })
})

describe('satisfies — satisfied ranges', () => {
  it.each([
    ['19.2.0', '^19.0.0'],
    ['19.2.0', '^19'],
    ['0.184.1', '^0.184.0'],
    ['0.0.3', '^0.0.3'],
    ['1.5.0', '~1.5.0'],
    ['1.9.0', '~1'],
    ['1.5.0', '1.x'],
    ['1.5.0', '1.X'],
    ['1.5.0', '1.*'],
    ['1.5.9', '1.5.x'],
    ['1.5.0', '1'],
    ['1.5.0', '1.5'],
    ['1.2.3', '1.2.3'],
    ['1.2.3', '=1.2.3'],
    ['1.5.0', '>1.0.0'],
    ['1.5.0', '>=1.5.0'],
    ['1.5.0', '<2.0.0'],
    ['1.5.0', '<=1.5.0'],
    ['1.5.0', '>=1.0.0 <2.0.0'],
    ['1.5.0', '1.2.3 - 2.0.0'],
    ['1.5.0', '^1 || ^2'],
    ['2.5.0', '^1 || ^2'],
    ['1.5.0', '*'],
    ['1.5.0', 'x'],
    ['1.5.0', 'latest'],
    ['1.5.0', ''],
  ])('%s satisfies %s', (version, range) => {
    expect(satisfies(version, range)).toBe(true)
  })
})

describe('satisfies — conflicting ranges', () => {
  // These are the forms that used to leak out as null and get waved through as
  // "assume satisfied" by callers, silently accepting a version mismatch.
  it.each([
    ['19.2.0', '^18.0.0'],
    ['19.2.0', '18.x'],
    ['19.2.0', '>=16 <18'],
    ['19.2.0', '^17 || ^18'],
    ['19.2.0', '16.0.0 - 18.9.9'],
    ['19.2.0', '<19.0.0'],
    ['19.2.0', '~18.2.0'],
    ['19.2.0', '18'],
    ['19.2.0', '18.2'],
    ['0.170.0', '^0.184.0'],
    ['1.5.0', '>2.0.0'],
    ['1.5.0', '>=2.0.0'],
    ['1.5.0', '<1.0.0'],
    ['1.5.0', '<=1.4.0'],
    ['1.2.4', '1.2.3'],
    ['1.2.4', '=1.2.3'],
    ['2.5.0', '>=1.0.0 <2.0.0'],
    ['1.0.0', '1.2.3 - 2.0.0'],
    ['3.0.0', '^1 || ^2'],
  ])('%s does not satisfy %s', (version, range) => {
    expect(satisfies(version, range)).toBe(false)
  })
})

describe('satisfies — genuinely unreadable', () => {
  it.each([
    ['git://github.com/x/y'],
    ['^not-a-version'],
    ['>=a.b.c'],
    ['~~1'],
    ['1.2.3.4.5'],
    ['workspace:*'],
  ])('returns null for %s', (range) => {
    expect(satisfies('1.0.0', range)).toBeNull()
  })

  it('returns null when the concrete version is unparseable', () => {
    expect(satisfies('not-a-version', '^1.0.0')).toBeNull()
  })

  it('returns null for a non-string range', () => {
    expect(satisfies('1.0.0', undefined as unknown as string)).toBeNull()
  })

  it('returns null when an OR branch is unreadable and no branch matches', () => {
    expect(satisfies('5.0.0', '^1 || git://x')).toBeNull()
  })

  it('prefers a matching OR branch over an unreadable sibling', () => {
    expect(satisfies('1.5.0', '^1 || git://x')).toBe(true)
  })

  it('returns null when an ANDed comparator is unreadable', () => {
    expect(satisfies('1.5.0', '>=1.0.0 <bogus')).toBeNull()
  })

  it('still returns false when a readable ANDed comparator excludes the version', () => {
    expect(satisfies('3.0.0', '<2.0.0 <bogus')).toBe(false)
  })
})

describe('isReadableRange', () => {
  it.each([
    ['^1.2.3'],
    ['~1.2.3'],
    ['1.2.3'],
    ['18.x'],
    ['>=1.0.0 <2.0.0'],
    ['1.2.3 - 2.0.0'],
    ['^1 || ^2'],
    ['*'],
    ['latest'],
    // A range that excludes the probe version is still readable — readability
    // is about the form, not the outcome.
    ['^99.0.0'],
  ])('accepts %s', (range) => {
    expect(isReadableRange(range)).toBe(true)
  })

  it.each([['^not-a-version'], ['>=a.b.c'], ['git://x'], ['~~1'], ['1.2.3.4.5']])(
    'rejects %s',
    (range) => {
      expect(isReadableRange(range)).toBe(false)
    },
  )

  it('rejects a non-string', () => {
    expect(isReadableRange(undefined as unknown as string)).toBe(false)
  })
})

describe('rangeAnchor', () => {
  it.each([
    ['^1.2.3', '1.2.3'],
    ['~1.2.3', '1.2.3'],
    ['>=1.2.3', '1.2.3'],
    ['1.2.3', '1.2.3'],
  ])('extracts %s → %s', (range, expected) => {
    expect(rangeAnchor(range)).toBe(expected)
  })

  it.each([['*'], ['x'], ['latest'], [''], ['1.x'], ['git://x']])(
    'returns null for %s (no comparable version)',
    (range) => {
      expect(rangeAnchor(range)).toBeNull()
    },
  )

  it('returns null for a non-string', () => {
    expect(rangeAnchor(null as unknown as string)).toBeNull()
  })
})
