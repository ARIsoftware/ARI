/**
 * Minimal semver helpers for the update check. Deliberately tiny — we only
 * compare release triples (MAJOR.MINOR.PATCH) and fail closed on anything we
 * can't parse, so a malformed version can never trigger the update popup.
 */

/** Drop semver build metadata: "1.5.3+6345611" → "1.5.3". */
export function stripBuildMetadata(version: string): string {
  return version.split("+")[0]
}

export function parseSemver(
  version: string
): { major: number; minor: number; patch: number } | null {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(stripBuildMetadata(version).trim())
  if (!match) return null
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  }
}

/** True only when `latest` is strictly newer than `current`. */
export function isNewerVersion(latest: string, current: string): boolean {
  const a = parseSemver(latest)
  const b = parseSemver(current)
  if (!a || !b) return false
  if (a.major !== b.major) return a.major > b.major
  if (a.minor !== b.minor) return a.minor > b.minor
  return a.patch > b.patch
}
