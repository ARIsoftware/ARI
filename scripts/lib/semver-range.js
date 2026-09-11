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
 *   partial:      "1", "1.2"            → treated as x-ranges (1.x, 1.2.x)
 *   x-range:      "1.x", "1.2.x", "18.X", "1.*"
 *   caret:        "^1.2.3"  → >=1.2.3 <2.0.0       (>=0.2.3 <0.3.0 for 0.x.y)
 *                                                  (>=0.0.3 <0.0.4 for 0.0.x)
 *   tilde:        "~1.2.3"  → >=1.2.3 <1.3.0       ("~1" → 1.x)
 *   comparators:  ">=1.2.3", ">1.2.3", "<=1.2.3", "<1.2.3", "=1.2.3"
 *   AND (space):  ">=1.0.0 <2.0.0"
 *   hyphen:       "1.2.3 - 2.0.0"       (inclusive both ends)
 *   OR:           "^1 || ^2"
 *   wildcards:    "*", "x", "latest"
 *
 * Returns null for anything else (caller treats null as "unknown"). Keeping
 * that set wide matters: a form we cannot parse yields null, and callers
 * disagree on what null means — npm-installer.ts refuses to proceed,
 * generate-module-registry.js assumes satisfied, reconcile-module-deps.js
 * reports the dep as invalid. A range that plainly conflicts must resolve to
 * `false` here rather than leaking out as null, or those callers silently
 * accept a mismatch.
 */

export function parseVersion(s) {
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
export function satisfies(version, range) {
  if (typeof range !== 'string') return null
  const v = parseVersion(version)
  if (!v) return null
  return evalRange(v, range.trim())
}

/**
 * Parse a possibly-partial, possibly-wildcarded version into the numeric
 * segments that were actually pinned. "1.2.3" → [1,2,3]; "1.2" → [1,2];
 * "1.x" → [1]; "x" → []. Returns null if it isn't that shape at all.
 */
function parsePartial(s) {
  if (typeof s !== 'string') return null
  const cleaned = s.replace(/^v/, '').split(/[-+]/)[0].trim()
  if (cleaned === '') return null
  const segs = cleaned.split('.')
  if (segs.length > 3) return null
  const pinned = []
  for (const seg of segs) {
    if (seg === 'x' || seg === 'X' || seg === '*') break
    if (!/^\d+$/.test(seg)) return null
    pinned.push(parseInt(seg, 10))
  }
  return pinned
}

// True when `v` matches every segment the range pinned — the x-range rule.
// "1.x" pins [1], so any 1.y.z matches; "1.2.3" pins all three, so it is exact.
function matchesPinned(v, pinned) {
  for (let i = 0; i < pinned.length; i++) {
    if (v[i] !== pinned[i]) return false
  }
  return true
}

function evalRange(v, range) {
  if (range === '') return true

  // OR binds loosest, so split on it first.
  if (range.includes('||')) {
    const branches = range
      .split('||')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
    if (branches.length === 0) return null
    let unknown = false
    for (const branch of branches) {
      const result = evalRange(v, branch)
      if (result === true) return true
      if (result === null) unknown = true
    }
    // Every branch said no (or we could not read some of them).
    return unknown ? null : false
  }

  // Hyphen range "1.2.3 - 2.0.0" must be matched before the whitespace split
  // below, which would otherwise tear it into ["1.2.3", "-", "2.0.0"].
  const hyphen = range.match(/^(\S+)\s+-\s+(\S+)$/)
  if (hyphen) {
    const lo = parseVersion(hyphen[1])
    const hi = parseVersion(hyphen[2])
    if (!lo || !hi) return null
    return cmp(v, lo) >= 0 && cmp(v, hi) <= 0
  }

  // Whitespace-separated comparators are ANDed: ">=1.0.0 <2.0.0".
  if (/\s/.test(range)) {
    let unknown = false
    for (const part of range.split(/\s+/).filter(Boolean)) {
      const result = evalComparator(v, part)
      if (result === false) return false
      if (result === null) unknown = true
    }
    return unknown ? null : true
  }

  return evalComparator(v, range)
}

// Two-character operators first, or ">=1.0.0" would be read as ">" of "=1.0.0".
const COMPARATORS = [
  ['>=', (c) => c >= 0],
  ['<=', (c) => c <= 0],
  ['>', (c) => c > 0],
  ['<', (c) => c < 0],
  ['=', (c) => c === 0],
]

function evalComparator(v, token) {
  const r = token.trim()
  if (r === '' || r === '*' || r === 'x' || r === 'X' || r === 'latest') return true

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

  // ~x.y.z — pins the minor, except "~1" which npm widens to 1.x.
  if (r.startsWith('~')) {
    const rest = r.slice(1)
    const pinned = parsePartial(rest)
    const base = parseVersion(rest)
    if (!base || !pinned) return null
    if (cmp(v, base) < 0) return false
    if (pinned.length <= 1) return v[0] === base[0]
    return v[0] === base[0] && v[1] === base[1]
  }

  for (const [op, test] of COMPARATORS) {
    if (!r.startsWith(op)) continue
    const base = parseVersion(r.slice(op.length).trim())
    if (!base) return null
    return test(cmp(v, base))
  }

  // Bare version, partial version, or x-range.
  const pinned = parsePartial(r)
  if (pinned) return matchesPinned(v, pinned)

  return null
}

/**
 * True when `satisfies` can actually evaluate this range form. Use it to reject
 * a declared range before writing it anywhere: an unreadable range cannot be
 * compared against anything, so accepting it means installing a spec nobody
 * checked. Probing with a literal version isolates range-form failures, since
 * null can otherwise also mean "unparseable version".
 */
export function isReadableRange(range) {
  return satisfies('0.0.0', range) !== null
}

/**
 * Extract a concrete version from a range spec, for the cases where pnpm
 * stores `"three": "^0.184.0"` in package.json and we need the "0.184.0"
 * part to compare. Returns null if no version is embedded.
 */
export function rangeAnchor(range) {
  if (typeof range !== 'string') return null
  const r = range.trim()
  if (!r || r === '*' || r === 'x' || r === 'latest') return null
  const stripped = r.replace(/^[\^~]|^>=\s*/, '')
  return parseVersion(stripped) ? stripped : null
}
