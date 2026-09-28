import { describe, expect, it } from 'vitest'
import {
  classifyUpdate,
  isNewerRelease,
  latestTag,
  parseRemoteTags,
  parseUpdateArgs,
  parseYesNo,
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

    it('flags an install that reports a newer version, leaving the verdict to history', () => {
      expect(resolveUpdateTarget({ currentVersion: '2.1.0', requested: null, tags: TAGS })).toEqual(
        { kind: 'candidate', target: { version: '2.0.7', sha: SHA_C }, relation: 'older' },
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

    it('flags an older release, leaving the verdict to history', () => {
      expect(
        resolveUpdateTarget({ currentVersion: '2.0.7', requested: '2.0.5', tags: TAGS }),
      ).toEqual({ kind: 'candidate', target: { version: '2.0.5', sha: SHA_A }, relation: 'older' })
    })

    it('compares an older release numerically, not as text', () => {
      const tags = [
        { version: '2.0.9', sha: SHA_A },
        { version: '2.0.10', sha: SHA_B },
      ]
      expect(resolveUpdateTarget({ currentVersion: '2.0.10', requested: '2.0.9', tags })).toEqual({
        kind: 'candidate',
        target: { version: '2.0.9', sha: SHA_A },
        relation: 'older',
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

describe('classifyUpdate', () => {
  describe('when history already contains the release', () => {
    it('is up to date when nothing lies beyond it', () => {
      expect(
        classifyUpdate({ relation: 'same', requested: false, contained: true, ahead: 0 }),
      ).toBe('up-to-date')
    })

    it('is ahead when local history goes past it', () => {
      expect(
        classifyUpdate({ relation: 'same', requested: false, contained: true, ahead: 16 }),
      ).toBe('ahead')
    })

    it('trusts history over a package.json that reports an older version', () => {
      expect(
        classifyUpdate({ relation: 'newer', requested: false, contained: true, ahead: 0 }),
      ).toBe('up-to-date')
      expect(
        classifyUpdate({ relation: 'newer', requested: true, contained: true, ahead: 3 }),
      ).toBe('ahead')
    })

    it('refuses a requested older release as a downgrade', () => {
      expect(
        classifyUpdate({ relation: 'older', requested: true, contained: true, ahead: 5 }),
      ).toBe('downgrade')
    })

    it('reports an install newer than the latest release when none was requested', () => {
      expect(
        classifyUpdate({ relation: 'older', requested: false, contained: true, ahead: 5 }),
      ).toBe('installed-newer')
    })

    it('decides from history when the installed version is unreadable', () => {
      expect(
        classifyUpdate({ relation: 'unknown', requested: false, contained: true, ahead: 0 }),
      ).toBe('up-to-date')
    })
  })

  describe('when history does not contain the release', () => {
    it('updates when the release is newer', () => {
      expect(
        classifyUpdate({ relation: 'newer', requested: false, contained: false, ahead: 0 }),
      ).toBe('update')
      expect(
        classifyUpdate({ relation: 'newer', requested: true, contained: false, ahead: 0 }),
      ).toBe('update')
    })

    it('reports missing commits when the version already matches', () => {
      expect(
        classifyUpdate({ relation: 'same', requested: false, contained: false, ahead: 0 }),
      ).toBe('update-missing-commits')
    })

    // A fork with its own version numbers, or a version bump merged without the
    // release: package.json says "newer" but the latest release is not there.
    it('does not trust a newer package.json version when updating to the latest', () => {
      expect(
        classifyUpdate({ relation: 'older', requested: false, contained: false, ahead: 2 }),
      ).toBe('update-version-mismatch')
    })
  })
})

describe('classifyUpdate — forward only', () => {
  // An older release named by the user is refused even when local history does
  // not contain it (shallow clone, squash-merged fork, re-initialised checkout).
  // Treating "not contained" as "safe to merge" would install older code.
  it.each([
    [true, 0],
    [true, 7],
    [false, 0],
    [false, 7],
  ])('refuses a named older release (contained: %s, ahead: %s)', (contained, ahead) => {
    expect(classifyUpdate({ relation: 'older', requested: true, contained, ahead })).toBe(
      'downgrade',
    )
  })

  it('never returns an update verdict for a named older release', () => {
    for (const contained of [true, false]) {
      const verdict = classifyUpdate({ relation: 'older', requested: true, contained, ahead: 0 })
      expect(verdict.startsWith('update')).toBe(false)
    }
  })
})

describe('classifyUpdate — unreadable installed version', () => {
  // package.json is missing or carries something like "2.1.0-custom", so there
  // is no way to tell whether a release the user named is older than what they
  // have. It must not be presented as an ordinary update.
  it('cannot vouch for a named release that history does not contain', () => {
    expect(
      classifyUpdate({ relation: 'unknown', requested: true, contained: false, ahead: 0 }),
    ).toBe('update-unverified')
  })

  it('cannot vouch for the latest release either', () => {
    // "2.1.0-custom" → 2.0.10 must not be one Enter away.
    expect(
      classifyUpdate({ relation: 'unknown', requested: false, contained: false, ahead: 0 }),
    ).toBe('update-unverified')
  })

  it('still trusts history when the named release is already contained', () => {
    expect(
      classifyUpdate({ relation: 'unknown', requested: true, contained: true, ahead: 0 }),
    ).toBe('up-to-date')
    expect(
      classifyUpdate({ relation: 'unknown', requested: true, contained: true, ahead: 4 }),
    ).toBe('ahead')
  })
})

describe('classifyUpdate — every input has a defined verdict', () => {
  const verdicts = [
    'up-to-date',
    'ahead',
    'downgrade',
    'installed-newer',
    'update',
    'update-missing-commits',
    'update-version-mismatch',
    'update-unverified',
  ]

  it('returns a known verdict for every combination', () => {
    for (const relation of ['newer', 'same', 'older', 'unknown'] as const) {
      for (const requested of [true, false]) {
        for (const contained of [true, false]) {
          for (const ahead of [0, 3]) {
            expect(verdicts).toContain(classifyUpdate({ relation, requested, contained, ahead }))
          }
        }
      }
    }
  })

  it('only ever defaults to yes for a release that is verifiably not older', () => {
    // The verdicts a caller may accept on Enter. Anything that merges without
    // being one of these needs a deliberate yes.
    const safeToDefault = ['update', 'update-missing-commits']
    for (const relation of ['older', 'unknown'] as const) {
      for (const requested of [true, false]) {
        const verdict = classifyUpdate({ relation, requested, contained: false, ahead: 0 })
        expect(safeToDefault).not.toContain(verdict)
      }
    }
    // And every verdict that does merge on a default yes is a newer-or-same release.
    for (const relation of ['newer', 'same'] as const) {
      const verdict = classifyUpdate({ relation, requested: false, contained: false, ahead: 0 })
      expect(safeToDefault).toContain(verdict)
    }
  })
})

describe('parseYesNo', () => {
  it.each([['y'], ['Y'], ['yes'], ['YES'], ['Yes'], [' y '], ['yes\r']])(
    'reads %j as yes',
    (answer) => {
      expect(parseYesNo(answer, false)).toBe(true)
      expect(parseYesNo(answer, true)).toBe(true)
    },
  )

  it.each([['n'], ['N'], ['no'], ['NO'], ['No'], [' no '], ['n\r']])('reads %j as no', (answer) => {
    expect(parseYesNo(answer, true)).toBe(false)
    expect(parseYesNo(answer, false)).toBe(false)
  })

  it.each([[''], ['   '], ['\r']])('uses the default for an empty answer %j', (answer) => {
    expect(parseYesNo(answer, true)).toBe(true)
    expect(parseYesNo(answer, false)).toBe(false)
  })

  // Anything unclear must never count as consent, whatever the default is.
  it.each([['nope'], ['yep'], ['ok'], ['sure'], ['q'], ['yn'], ['y n'], ['1'], ['nо']])(
    'treats the unclear answer %j as no',
    (answer) => {
      expect(parseYesNo(answer, true)).toBe(false)
      expect(parseYesNo(answer, false)).toBe(false)
    },
  )

  it('treats a missing answer as no', () => {
    expect(parseYesNo(null, true)).toBe(false)
    expect(parseYesNo(undefined as unknown as string, true)).toBe(false)
  })
})
