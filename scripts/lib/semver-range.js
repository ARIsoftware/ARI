/**
 * Tiny semver range checker for module npm dependencies.
 *
 * Shared between the build-time validator (scripts/generate-module-registry.js)
 * and the runtime installer (lib/modules/npm-installer.ts). Intentionally
 * limited to the range forms modules are allowed to declare so we don't
 * pull `semver` into root dependencies just for this.
 *
 * Supported range forms:
 *   exact:        "1.2.3"
 *   caret:        "^1.2.3"  → >=1.2.3 <2.0.0       (>=0.2.3 <0.3.0 for 0.x.y)
 *                                                  (>=0.0.3 <0.0.4 for 0.0.x)
 *   tilde:        "~1.2.3"  → >=1.2.3 <1.3.0
 *   gte:          ">=1.2.3"
 *   wildcards:    "*", "x", "latest"
 *
 * Returns null for anything else (caller treats null as "unknown, abort
 * before doing anything destructive").
 */

function parseVersion(s) {
  if (typeof s !== 'string') return null
  // Strip leading "v" and any pre-release/build suffix for comparison
  const cleaned = s.replace(/^v/, '').split(/[-+]/)[0]
  const parts = cleaned.split('.')
  if (parts.length < 1 || parts.length > 3) return null
  const nums = parts.map((p) => {
    if (!/^\d+$/.test(p)) return NaN
    return parseInt(p, 10)
  })
  if (nums.some(Number.isNaN)) return null
  while (nums.length < 3) nums.push(0)
  return nums
}

function cmp(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i]
  }
  return 0
}

/**
 * @param {string} version - concrete version, e.g. "1.2.3"
 * @param {string} range   - range spec, e.g. "^1.2.0"
 * @returns {boolean | null} true if range is satisfied, false if not,
 *                            null if range form is not recognized.
 */
function satisfies(version, range) {
  if (typeof range !== 'string') return null
  const v = parseVersion(version)
  if (!v) return null

  const r = range.trim()

  if (r === '*' || r === 'x' || r === 'latest' || r === '') return true

  // ^x.y.z
  if (r.startsWith('^')) {
    const base = parseVersion(r.slice(1))
    if (!base) return null
    if (cmp(v, base) < 0) return false
    // Upper bound depends on which segment is the first non-zero.
    if (base[0] > 0) return v[0] === base[0]
    if (base[1] > 0) return v[0] === 0 && v[1] === base[1]
    return v[0] === 0 && v[1] === 0 && v[2] === base[2]
  }

  // ~x.y.z
  if (r.startsWith('~')) {
    const base = parseVersion(r.slice(1))
    if (!base) return null
    if (cmp(v, base) < 0) return false
    return v[0] === base[0] && v[1] === base[1]
  }

  // >=x.y.z
  if (r.startsWith('>=')) {
    const base = parseVersion(r.slice(2).trim())
    if (!base) return null
    return cmp(v, base) >= 0
  }

  // exact "x.y.z" (only if it parses cleanly as a version)
  const exact = parseVersion(r)
  if (exact) return cmp(v, exact) === 0

  return null
}

/**
 * Extract a concrete version from a range spec, for the cases where pnpm
 * stores `"three": "^0.184.0"` in package.json and we need the "0.184.0"
 * part to compare. Returns null if no version is embedded.
 */
function rangeAnchor(range) {
  if (typeof range !== 'string') return null
  const r = range.trim()
  if (!r || r === '*' || r === 'x' || r === 'latest') return null
  const stripped = r.replace(/^[\^~]|^>=\s*/, '')
  return parseVersion(stripped) ? stripped : null
}

module.exports = { satisfies, parseVersion, rangeAnchor }
