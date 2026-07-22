import { describe, it, expect } from 'vitest'
import {
  stripBuildMetadata,
  parseSemver,
  isNewerVersion,
} from '@/lib/version-compare'

describe('stripBuildMetadata', () => {
  it('drops the +sha suffix', () => {
    expect(stripBuildMetadata('1.5.3+6345611')).toBe('1.5.3')
  })

  it('returns plain versions unchanged', () => {
    expect(stripBuildMetadata('1.5.3')).toBe('1.5.3')
  })
})

describe('parseSemver', () => {
  it('parses a release triple', () => {
    expect(parseSemver('1.5.3')).toEqual({ major: 1, minor: 5, patch: 3 })
  })

  it('parses through build metadata and prerelease tails', () => {
    expect(parseSemver('1.5.3+abc123')).toEqual({ major: 1, minor: 5, patch: 3 })
    expect(parseSemver('2.0.0-beta.1')).toEqual({ major: 2, minor: 0, patch: 0 })
  })

  it('returns null on malformed input', () => {
    expect(parseSemver('')).toBeNull()
    expect(parseSemver('not-a-version')).toBeNull()
    expect(parseSemver('1.5')).toBeNull()
  })
})

describe('isNewerVersion', () => {
  it('detects newer major, minor, and patch', () => {
    expect(isNewerVersion('2.0.0', '1.9.9')).toBe(true)
    expect(isNewerVersion('1.6.0', '1.5.3')).toBe(true)
    expect(isNewerVersion('1.5.4', '1.5.3')).toBe(true)
  })

  it('is false for equal or older versions', () => {
    expect(isNewerVersion('1.5.3', '1.5.3')).toBe(false)
    expect(isNewerVersion('1.5.2', '1.5.3')).toBe(false)
    expect(isNewerVersion('0.9.0', '1.0.0')).toBe(false)
  })

  it('compares numerically, not lexicographically', () => {
    expect(isNewerVersion('1.10.0', '1.9.0')).toBe(true)
    expect(isNewerVersion('10.0.0', '9.0.0')).toBe(true)
  })

  it('ignores build metadata on either side', () => {
    expect(isNewerVersion('1.6.0', '1.5.3+6345611')).toBe(true)
    expect(isNewerVersion('1.5.3+aaa', '1.5.3+bbb')).toBe(false)
  })

  it('fails closed on malformed input', () => {
    expect(isNewerVersion('garbage', '1.5.3')).toBe(false)
    expect(isNewerVersion('1.6.0', 'garbage')).toBe(false)
    expect(isNewerVersion('', '')).toBe(false)
  })
})
