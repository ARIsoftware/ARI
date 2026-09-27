import { describe, expect, it } from 'vitest'
import {
  isNewerRelease,
  latestTag,
  parseRemoteTags,
  parseUpdateArgs,
  resolveUpdateTarget,
} from '@/scripts/lib/update-target.js'

const SHA_A = 'a'.repeat(40)
const SHA_B = 'b'.repeat(40)
const SHA_C = 'c'.repeat(40)
const SHA_D = 'd'.repeat(40)

const TAGS = [
  { version: '2.0.5', sha: SHA_A },
  { version: '2.0.7', sha: SHA_C },
  { version: '2.0.6', sha: SHA_B },
]

describe('parseUpdateArgs', () => {
  it('defaults to the latest release', () => {
    expect(parseUpdateArgs([])).toEqual({ edge: false, version: null, help: false, error: null })
  })

  it('accepts --edge', () => {
    expect(parseUpdateArgs(['--edge'])).toMatchObject({ edge: true, version: null, error: null })
  })

  it.each([['--help'], ['-h']])('accepts %s', (flag) => {
    expect(parseUpdateArgs([flag])).toMatchObject({ help: true, error: null })
  })

  it.each([
    ['2.0.5', '2.0.5'],
    ['v2.0.5', '2.0.5'],
    ['10.20.30', '10.20.30'],
  ])('accepts version %s', (input, expected) => {
    expect(parseUpdateArgs([input])).toMatchObject({ version: expected, error: null })
  })

  it.each([
    ['2.0'],
    ['2'],
    ['2.0.5.1'],
    ['2.0.5-beta.1'],
    ['2.0.5+build'],
    ['latest'],
    ['main'],
    ['2.0.x'],
    ['2.0.5; rm -rf /'],
    ['$(whoami)'],
    [''],
  ])('rejects malformed version %j', (input) => {
    const parsed = parseUpdateArgs([input])
    expect(parsed.error).toMatch(/Not a valid version/)
    expect(parsed.version).toBeNull()
  })

  it.each([['--force'], ['--yes'], ['-x'], ['--edge=1']])('rejects unknown option %s', (flag) => {
    expect(parseUpdateArgs([flag]).error).toBe(`Unknown option: ${flag}`)
  })

  it('rejects two versions', () => {
    expect(parseUpdateArgs(['2.0.5', '2.0.6']).error).toBe('Only one version can be given.')
  })

  it.each([[['--edge', '2.0.5']], [['2.0.5', '--edge']]])(
    'rejects --edge combined with a version (%j)',
    (argv) => {
      expect(parseUpdateArgs(argv).error).toMatch(/cannot be combined/)
    },
  )
})

describe('parseRemoteTags', () => {
  it('uses the peeled sha of an annotated tag', () => {
    const text = `${SHA_A}\trefs/tags/2.0.7\n${SHA_B}\trefs/tags/2.0.7^{}\n`
    expect(parseRemoteTags(text)).toEqual([{ version: '2.0.7', sha: SHA_B }])
  })

  it('uses the peeled sha even when it is listed first', () => {
    const text = `${SHA_B}\trefs/tags/2.0.7^{}\n${SHA_A}\trefs/tags/2.0.7\n`
    expect(parseRemoteTags(text)).toEqual([{ version: '2.0.7', sha: SHA_B }])
  })

  it('uses the plain sha of a lightweight tag', () => {
    expect(parseRemoteTags(`${SHA_A}\trefs/tags/2.0.7\n`)).toEqual([
      { version: '2.0.7', sha: SHA_A },
    ])
  })

  it('reads several tags', () => {
    const text = [
      `${SHA_A}\trefs/tags/2.0.6`,
      `${SHA_B}\trefs/tags/2.0.6^{}`,
      `${SHA_C}\trefs/tags/2.0.7`,
      `${SHA_D}\trefs/tags/2.0.7^{}`,
    ].join('\n')
    expect(parseRemoteTags(text)).toEqual([
      { version: '2.0.6', sha: SHA_B },
      { version: '2.0.7', sha: SHA_D },
    ])
  })

  it('tolerates CRLF line endings', () => {
    const text = `${SHA_A}\trefs/tags/2.0.7\r\n${SHA_B}\trefs/tags/2.0.7^{}\r\n`
    expect(parseRemoteTags(text)).toEqual([{ version: '2.0.7', sha: SHA_B }])
  })

  it('accepts SHA-256 object names', () => {
    const sha = 'e'.repeat(64)
    expect(parseRemoteTags(`${sha}\trefs/tags/2.0.7\n`)).toEqual([{ version: '2.0.7', sha }])
  })

  it.each([
    ['a v-prefixed tag', `${SHA_A}\trefs/tags/v2.0.8`],
    ['a prerelease tag', `${SHA_A}\trefs/tags/2.0.8-rc.1`],
    ['a peeled prerelease tag', `${SHA_A}\trefs/tags/2.0.8-rc.1^{}`],
    ['a two-part tag', `${SHA_A}\trefs/tags/2.0`],
    ['a branch', `${SHA_A}\trefs/heads/2.0.8`],
    ['a nested tag', `${SHA_A}\trefs/tags/release/2.0.8`],
    ['a short sha', `${'a'.repeat(39)}\trefs/tags/2.0.8`],
    ['an uppercase sha', `${'A'.repeat(40)}\trefs/tags/2.0.8`],
    ['a space separator', `${SHA_A} refs/tags/2.0.8`],
    ['trailing text', `${SHA_A}\trefs/tags/2.0.8 extra`],
    ['git noise', 'warning: redirecting to https://example.com/'],
  ])('ignores %s', (_label, line) => {
    expect(parseRemoteTags(line)).toEqual([])
  })

  it('returns nothing for empty output', () => {
    expect(parseRemoteTags('')).toEqual([])
  })

  it('returns nothing for a non-string', () => {
    expect(parseRemoteTags(null as unknown as string)).toEqual([])
  })
})

describe('latestTag', () => {
  it('picks the highest version regardless of order', () => {
    expect(latestTag(TAGS)).toEqual({ version: '2.0.7', sha: SHA_C })
  })

  it('compares numerically, not as text', () => {
    const tags = [
      { version: '2.0.9', sha: SHA_A },
      { version: '2.0.10', sha: SHA_B },
      { version: '1.99.99', sha: SHA_C },
    ]
    expect(latestTag(tags)?.version).toBe('2.0.10')
  })

  it('returns null when there are no tags', () => {
    expect(latestTag([])).toBeNull()
  })
})

describe('resolveUpdateTarget', () => {
  it('reports when upstream has no releases', () => {
    expect(resolveUpdateTarget({ currentVersion: '2.0.5', requested: null, tags: [] })).toEqual({
      kind: 'no-tags',
    })
    expect(resolveUpdateTarget({ currentVersion: '2.0.5', requested: '2.0.6', tags: [] })).toEqual({
      kind: 'no-tags',
    })
  })

  describe('without a requested version', () => {
    it('targets the latest release when behind', () => {
      expect(resolveUpdateTarget({ currentVersion: '2.0.5', requested: null, tags: TAGS })).toEqual(
        { kind: 'candidate', target: { version: '2.0.7', sha: SHA_C }, relation: 'newer' },
      )
    })

    it('still returns the latest release when the version matches, so history can decide', () => {
      expect(resolveUpdateTarget({ currentVersion: '2.0.7', requested: null, tags: TAGS })).toEqual(
        { kind: 'candidate', target: { version: '2.0.7', sha: SHA_C }, relation: 'same' },
      )
    })

    it('reports an install that is newer than every release', () => {
      expect(resolveUpdateTarget({ currentVersion: '2.1.0', requested: null, tags: TAGS })).toEqual(
        { kind: 'installed-newer', current: '2.1.0', latest: '2.0.7' },
      )
    })

    it.each([[null], ['not-a-version'], ['2.0.7-dev'], ['']])(
      'falls back to history when the installed version is %j',
      (currentVersion) => {
        expect(resolveUpdateTarget({ currentVersion, requested: null, tags: TAGS })).toEqual({
          kind: 'candidate',
          target: { version: '2.0.7', sha: SHA_C },
          relation: 'unknown',
        })
      },
    )
  })

  describe('with a requested version', () => {
    it('targets a newer release that is not the latest', () => {
      expect(
        resolveUpdateTarget({ currentVersion: '2.0.5', requested: '2.0.6', tags: TAGS }),
      ).toEqual({ kind: 'candidate', target: { version: '2.0.6', sha: SHA_B }, relation: 'newer' })
    })

    it('returns the installed release as a candidate, so history can decide', () => {
      expect(
        resolveUpdateTarget({ currentVersion: '2.0.6', requested: '2.0.6', tags: TAGS }),
      ).toEqual({ kind: 'candidate', target: { version: '2.0.6', sha: SHA_B }, relation: 'same' })
    })

    it('refuses an older release', () => {
      expect(
        resolveUpdateTarget({ currentVersion: '2.0.7', requested: '2.0.5', tags: TAGS }),
      ).toEqual({ kind: 'downgrade', requested: '2.0.5', current: '2.0.7' })
    })

    it('refuses an older release numerically, not as text', () => {
      const tags = [
        { version: '2.0.9', sha: SHA_A },
        { version: '2.0.10', sha: SHA_B },
      ]
      expect(resolveUpdateTarget({ currentVersion: '2.0.10', requested: '2.0.9', tags })).toEqual({
        kind: 'downgrade',
        requested: '2.0.9',
        current: '2.0.10',
      })
    })

    it('reports an unreleased version with the newer releases, highest first', () => {
      expect(
        resolveUpdateTarget({ currentVersion: '2.0.5', requested: '9.9.9', tags: TAGS }),
      ).toEqual({ kind: 'unknown-version', requested: '9.9.9', newer: ['2.0.7', '2.0.6'] })
    })

    it('reports an unreleased version with no newer releases', () => {
      expect(
        resolveUpdateTarget({ currentVersion: '2.0.7', requested: '2.0.8', tags: TAGS }),
      ).toEqual({ kind: 'unknown-version', requested: '2.0.8', newer: [] })
    })

    it('reports an unreleased older version as unknown rather than a downgrade', () => {
      expect(
        resolveUpdateTarget({ currentVersion: '2.0.7', requested: '2.0.1', tags: TAGS }),
      ).toEqual({ kind: 'unknown-version', requested: '2.0.1', newer: [] })
    })

    it('lists every release when the installed version is unreadable', () => {
      expect(resolveUpdateTarget({ currentVersion: null, requested: '9.9.9', tags: TAGS })).toEqual(
        { kind: 'unknown-version', requested: '9.9.9', newer: ['2.0.7', '2.0.6', '2.0.5'] },
      )
    })

    it('cannot call a request a downgrade when the installed version is unreadable', () => {
      expect(resolveUpdateTarget({ currentVersion: null, requested: '2.0.5', tags: TAGS })).toEqual(
        { kind: 'candidate', target: { version: '2.0.5', sha: SHA_A }, relation: 'unknown' },
      )
    })
  })
})

describe('isNewerRelease', () => {
  it.each([
    ['2.0.8', '2.0.7'],
    ['2.1.0', '2.0.99'],
    ['3.0.0', '2.99.99'],
    ['2.0.10', '2.0.9'],
  ])('%s is newer than %s', (latest, current) => {
    expect(isNewerRelease(latest, current)).toBe(true)
  })

  it.each([
    ['2.0.7', '2.0.7'],
    ['2.0.6', '2.0.7'],
    ['2.0.9', '2.0.10'],
  ])('%s is not newer than %s', (latest, current) => {
    expect(isNewerRelease(latest, current)).toBe(false)
  })

  it.each([
    ['2.0.8-beta.1', '2.0.7'],
    ['v2.0.8', '2.0.7'],
    ['2.0.8', '2.0.7-dev'],
    ['2.0.8', ''],
    [null, '2.0.7'],
    ['2.0.8', null],
  ])('is false when either side is not a release (%j, %j)', (latest, current) => {
    expect(isNewerRelease(latest, current)).toBe(false)
  })
})
