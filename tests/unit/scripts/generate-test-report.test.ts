/**
 * The rules behind reusing lib/generated/test-report.json on boot: how git's
 * status output is read, what goes into the inputs fingerprint, and when an
 * existing report may stand in for a run. The fingerprint against a real
 * repository is covered by generate-test-report.lab.test.ts.
 */
import { describe, expect, it } from 'vitest'
import {
  FINGERPRINT_VERSION,
  canReuseReport,
  fingerprintFromParts,
  localDay,
  parseStatusPaths,
} from '@/scripts/generate-test-report.mjs'

describe('parseStatusPaths', () => {
  it('reads one path per NUL-terminated record', () => {
    const out = ' M lib/a.ts\0?? modules-custom/x/module.json\0D  tests/gone.test.ts\0'
    expect(parseStatusPaths(out)).toEqual([
      'lib/a.ts',
      'modules-custom/x/module.json',
      'tests/gone.test.ts',
    ])
  })

  it('keeps spaces and odd characters in paths (no quoting under -z)', () => {
    expect(parseStatusPaths('?? docs/my notes (draft).md\0')).toEqual(['docs/my notes (draft).md'])
  })

  it('returns nothing for a clean tree', () => {
    expect(parseStatusPaths('')).toEqual([])
  })

  it('ignores records too short to carry a path', () => {
    expect(parseStatusPaths('XY\0\0 M \0')).toEqual([])
  })
})

describe('fingerprintFromParts', () => {
  const base = {
    head: 'a'.repeat(40),
    nodeVersion: 'v26.0.0',
    platform: 'darwin-arm64',
    day: '2026-11-08',
    entries: [
      { path: 'lib/a.ts', size: 10, mtimeMs: 1000 },
      { path: 'tests/b.test.ts', size: 20, mtimeMs: 2000 },
    ],
  }

  it('is deterministic', () => {
    expect(fingerprintFromParts(base)).toBe(fingerprintFromParts({ ...base }))
    expect(fingerprintFromParts(base)).toMatch(/^[0-9a-f]{64}$/)
  })

  it('does not depend on the order git listed the files in', () => {
    const reversed = { ...base, entries: [...base.entries].reverse() }
    expect(fingerprintFromParts(reversed)).toBe(fingerprintFromParts(base))
  })

  it('changes with the commit at HEAD', () => {
    expect(fingerprintFromParts({ ...base, head: 'b'.repeat(40) })).not.toBe(
      fingerprintFromParts(base),
    )
  })

  it("changes with a dirty file's size or modification time", () => {
    const bigger = { ...base, entries: [{ ...base.entries[0], size: 11 }, base.entries[1]] }
    const touched = { ...base, entries: [{ ...base.entries[0], mtimeMs: 1001 }, base.entries[1]] }
    expect(fingerprintFromParts(bigger)).not.toBe(fingerprintFromParts(base))
    expect(fingerprintFromParts(touched)).not.toBe(fingerprintFromParts(base))
  })

  it('changes when a file appears, disappears or is deleted on disk', () => {
    const added = { ...base, entries: [...base.entries, { path: 'new.ts', size: 1, mtimeMs: 1 }] }
    const fewer = { ...base, entries: [base.entries[0]] }
    const deleted = {
      ...base,
      entries: [base.entries[0], { ...base.entries[1], size: -1, mtimeMs: -1 }],
    }
    const seen = new Set([base, added, fewer, deleted].map(fingerprintFromParts))
    expect(seen.size).toBe(4)
  })

  it('changes with the Node version and platform', () => {
    expect(fingerprintFromParts({ ...base, nodeVersion: 'v27.0.0' })).not.toBe(
      fingerprintFromParts(base),
    )
    expect(fingerprintFromParts({ ...base, platform: 'linux-x64' })).not.toBe(
      fingerprintFromParts(base),
    )
  })

  it('changes with the calendar day, since some tests read the real clock', () => {
    expect(fingerprintFromParts({ ...base, day: '2026-11-09' })).not.toBe(
      fingerprintFromParts(base),
    )
  })

  it('is versioned so a layout change retires old reports', () => {
    expect(FINGERPRINT_VERSION).toBeGreaterThanOrEqual(2)
  })
})

describe('localDay', () => {
  it('is the local calendar date, zero-padded', () => {
    expect(localDay(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
    expect(localDay(new Date(2026, 11, 31, 0, 0))).toBe('2026-12-31')
  })

  it('defaults to today', () => {
    expect(localDay()).toBe(localDay(new Date()))
  })
})

describe('canReuseReport', () => {
  const fp = 'f'.repeat(64)
  const passing = {
    success: true,
    numTotalTests: 4930,
    numPassedTests: 4930,
    numFailedTests: 0,
    inputsFingerprint: fp,
  }

  it('reuses a passing report produced from the same inputs', () => {
    expect(canReuseReport(passing, fp)).toBe(true)
  })

  it('never reuses when the inputs could not be fingerprinted', () => {
    expect(canReuseReport(passing, null)).toBe(false)
    expect(canReuseReport(passing, undefined)).toBe(false)
    expect(canReuseReport(passing, '')).toBe(false)
  })

  it('does not reuse a report from other inputs', () => {
    expect(canReuseReport(passing, 'e'.repeat(64))).toBe(false)
    expect(canReuseReport({ ...passing, inputsFingerprint: undefined }, fp)).toBe(false)
  })

  it('does not reuse a failing report, so it runs again until it passes', () => {
    expect(canReuseReport({ ...passing, success: false }, fp)).toBe(false)
    expect(canReuseReport({ ...passing, numFailedTests: 1 }, fp)).toBe(false)
  })

  it('does not reuse a fallback or an empty run', () => {
    expect(canReuseReport({ ...passing, numTotalTests: 0, numPassedTests: 0 }, fp)).toBe(false)
    expect(
      canReuseReport({ success: false, error: 'Vitest failed to run', numTotalTests: 0 }, fp),
    ).toBe(false)
  })

  it('does not reuse a missing or malformed report', () => {
    expect(canReuseReport(null, fp)).toBe(false)
    expect(canReuseReport(undefined, fp)).toBe(false)
    expect(canReuseReport('{}', fp)).toBe(false)
    expect(canReuseReport({ ...passing, numTotalTests: '4930' }, fp)).toBe(false)
  })
})
