/**
 * Release-target resolution for `./ari update`.
 *
 * ARI releases are git tags named `X.Y.Z` (no "v" prefix) on the upstream
 * repository. This module holds the pure decisions — which arguments are
 * valid, which tags count as releases, and what a requested update means
 * relative to the installed version — so they can be unit tested. All git and
 * terminal I/O stays in .ari/cli.js, which cannot be imported by a test.
 *
 * Only strict `X.Y.Z` names are releases. Prerelease tags (`2.1.0-beta.1`) and
 * prefixed tags (`v2.1.0`) are ignored, so they can never be picked as "latest".
 */

import { cmp, parseVersion } from './semver-range.js'

const RELEASE_RE = /^\d+\.\d+\.\d+$/
// `git ls-remote --tags` line: "<sha>\trefs/tags/<name>" plus, for annotated
// tags, a second "<sha>\trefs/tags/<name>^{}" line carrying the commit the tag
// points at. SHA-1 (40 hex) and SHA-256 (64 hex) repositories both match.
const TAG_LINE_RE = /^([0-9a-f]{40}|[0-9a-f]{64})\trefs\/tags\/(\d+\.\d+\.\d+)(\^\{\})?$/

/**
 * @typedef {{ version: string, sha: string }} ReleaseTag
 *
 * @typedef {{ edge: boolean, version: string | null, help: boolean, error: string | null }} UpdateArgs
 *
 * @typedef {(
 *   | { kind: 'no-tags' }
 *   | { kind: 'unknown-version', requested: string, newer: string[] }
 *   | { kind: 'downgrade', requested: string, current: string }
 *   | { kind: 'installed-newer', current: string, latest: string }
 *   | { kind: 'candidate', target: ReleaseTag, relation: 'newer' | 'same' | 'unknown' }
 * )} UpdateTarget
 */

/**
 * Parse the arguments that follow `./ari update`.
 *
 * @param {string[]} argv
 * @returns {UpdateArgs}
 */
export function parseUpdateArgs(argv) {
  /** @type {UpdateArgs} */
  const parsed = { edge: false, version: null, help: false, error: null }
  const fail = (error) => ({ ...parsed, error })

  for (const arg of argv) {
    if (arg === '--edge') {
      parsed.edge = true
    } else if (arg === '--help' || arg === '-h') {
      parsed.help = true
    } else if (arg.startsWith('-')) {
      return fail(`Unknown option: ${arg}`)
    } else if (parsed.version !== null) {
      return fail('Only one version can be given.')
    } else {
      const version = arg.replace(/^v/, '')
      if (!RELEASE_RE.test(version)) {
        return fail(`Not a valid version: ${arg} (expected a release like 2.0.5)`)
      }
      parsed.version = version
    }
  }

  if (parsed.edge && parsed.version !== null) {
    return fail('--edge follows main and cannot be combined with a version.')
  }
  return parsed
}

/**
 * Extract release tags from `git ls-remote --tags` output. The peeled (`^{}`)
 * sha wins when present because it is the commit; the plain line of an
 * annotated tag is the tag object. Lightweight tags only have the plain line,
 * which already names the commit.
 *
 * @param {string} text
 * @returns {ReleaseTag[]}
 */
export function parseRemoteTags(text) {
  if (typeof text !== 'string') return []
  /** @type {Map<string, { sha: string, peeled: boolean }>} */
  const found = new Map()

  for (const raw of text.split('\n')) {
    const match = raw.trim().match(TAG_LINE_RE)
    if (!match) continue
    const [, sha, version, peeledMarker] = match
    const peeled = Boolean(peeledMarker)
    const existing = found.get(version)
    if (!existing || (peeled && !existing.peeled)) {
      found.set(version, { sha, peeled })
    }
  }

  return [...found].map(([version, { sha }]) => ({ version, sha }))
}

/**
 * @param {ReleaseTag[]} tags
 * @returns {ReleaseTag | null} the highest release, or null when there are none
 */
export function latestTag(tags) {
  let latest = null
  for (const tag of tags) {
    if (!latest || compare(tag.version, latest.version) > 0) latest = tag
  }
  return latest
}

/**
 * Decide what an update request means. This is the version gate only: a
 * `candidate` still has to be checked against git history by the caller,
 * because an install that followed main can already contain a release its
 * package.json does not report.
 *
 * @param {{ currentVersion: string | null, requested: string | null, tags: ReleaseTag[] }} input
 * @returns {UpdateTarget}
 */
export function resolveUpdateTarget({ currentVersion, requested, tags }) {
  if (tags.length === 0) return { kind: 'no-tags' }

  // An unreadable package.json version cannot gate anything; history decides.
  const current = currentVersion !== null && RELEASE_RE.test(currentVersion) ? currentVersion : null

  if (requested !== null) {
    const target = tags.find((tag) => tag.version === requested)
    if (!target) {
      const floor = current ?? '0.0.0'
      const newer = tags
        .map((tag) => tag.version)
        .filter((version) => compare(version, floor) > 0)
        .sort((a, b) => compare(b, a))
      return { kind: 'unknown-version', requested, newer }
    }
    if (current !== null && compare(requested, current) < 0) {
      return { kind: 'downgrade', requested, current }
    }
    return { kind: 'candidate', target, relation: relationTo(target.version, current) }
  }

  const latest = /** @type {ReleaseTag} */ (latestTag(tags))
  if (current !== null && compare(current, latest.version) > 0) {
    return { kind: 'installed-newer', current, latest: latest.version }
  }
  return { kind: 'candidate', target: latest, relation: relationTo(latest.version, current) }
}

/**
 * @param {string | null} latest
 * @param {string | null} current
 * @returns {boolean} true only when both are releases and latest is strictly newer
 */
export function isNewerRelease(latest, current) {
  if (typeof latest !== 'string' || typeof current !== 'string') return false
  if (!RELEASE_RE.test(latest) || !RELEASE_RE.test(current)) return false
  return compare(latest, current) > 0
}

function relationTo(target, current) {
  if (current === null) return 'unknown'
  return compare(target, current) > 0 ? 'newer' : 'same'
}

// Both sides are strict X.Y.Z by the time they reach here, so parseVersion
// cannot return null.
function compare(a, b) {
  return cmp(/** @type {number[]} */ (parseVersion(a)), /** @type {number[]} */ (parseVersion(b)))
}
