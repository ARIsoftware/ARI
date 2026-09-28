import { describe, expect, it } from 'vitest'
import { changelogHasEntry, checkReleaseTag } from '@/scripts/lib/release-tag.js'

const CHANGELOG = '# Changelog\n\n## 2.0.11\n\n- Something\n\n## 2.0.10\n\n- Earlier\n'

const valid = {
  tag: '2.0.11',
  packageVersion: '2.0.11',
  objectType: 'tag',
  onMain: true,
  changelog: CHANGELOG,
}

describe('checkReleaseTag', () => {
  it('accepts a valid release', () => {
    expect(checkReleaseTag(valid)).toEqual([])
  })

  it.each([
    ['v2.0.11'],
    ['2.0'],
    ['2.0.11-beta.1'],
    ['2.0.11+build'],
    ['release-2.0.11'],
    ['latest'],
    [''],
  ])('rejects the tag name %j, and reports only that', (tag) => {
    const problems = checkReleaseTag({ ...valid, tag })

    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('is not a release number')
  })

  it('rejects a tag that disagrees with package.json', () => {
    const problems = checkReleaseTag({ ...valid, packageVersion: '2.0.10' })

    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('package.json says 2.0.10 but the tag is 2.0.11')
  })

  it('rejects an unreadable package.json version', () => {
    expect(checkReleaseTag({ ...valid, packageVersion: null })).toEqual([
      'package.json at the tagged commit has no readable "version".',
    ])
  })

  it('rejects a lightweight tag', () => {
    const problems = checkReleaseTag({ ...valid, objectType: 'commit' })

    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('is lightweight')
  })

  it('rejects a tag on a commit that is not on main', () => {
    const problems = checkReleaseTag({ ...valid, onMain: false })

    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('is not on main')
  })

  it('rejects a release with no changelog file', () => {
    expect(checkReleaseTag({ ...valid, changelog: null })).toEqual([
      'CHANGELOG.md is missing at the tagged commit.',
    ])
  })

  it('rejects a release with no changelog entry', () => {
    const problems = checkReleaseTag({ ...valid, tag: '2.0.12', packageVersion: '2.0.12' })

    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('no "## 2.0.12" entry')
  })

  it('reports every problem at once', () => {
    const problems = checkReleaseTag({
      tag: '2.0.12',
      packageVersion: '2.0.10',
      objectType: 'commit',
      onMain: false,
      changelog: null,
    })

    expect(problems).toHaveLength(4)
  })
})

describe('changelogHasEntry', () => {
  it.each([
    ['## 2.0.11\n'],
    ['## 2.0.11 (2026-10-01)\n'],
    ['## 2.0.11 - 2026-10-01\n'],
    ['## [2.0.11]\n'],
    ['##   2.0.11\n'],
    ['intro\n\n## 2.0.11\n\n- x\n'],
  ])('finds the entry in %j', (changelog) => {
    expect(changelogHasEntry(changelog, '2.0.11')).toBe(true)
  })

  it.each([
    ['## 2.0.110\n'],
    ['## 2.0.11.1\n'],
    ['## 12.0.11\n'],
    ['### 2.0.11\n'],
    ['# 2.0.11\n'],
    ['text ## 2.0.11\n'],
    ['Released 2.0.11 today\n'],
    ['## 2x0x11\n'],
    [''],
  ])('does not take %j for the entry', (changelog) => {
    expect(changelogHasEntry(changelog, '2.0.11')).toBe(false)
  })

  it('does not take 2.0.1 for 2.0.11 or the other way round', () => {
    expect(changelogHasEntry('## 2.0.11\n', '2.0.1')).toBe(false)
    expect(changelogHasEntry('## 2.0.1\n', '2.0.11')).toBe(false)
  })
})
