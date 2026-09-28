/**
 * What makes a git tag a valid ARI release. Checked by CI when a tag is pushed
 * (.github/workflows/release-check.yml via scripts/check-release-tag.mjs).
 *
 * The updater and the in-app notice both trust tags: `./ari update` moves
 * installs to the newest `X.Y.Z` tag, so a tag that disagrees with the code it
 * points at sends every user to something mislabelled.
 */

const RELEASE_RE = /^\d+\.\d+\.\d+$/

/**
 * @typedef {object} ReleaseTagFacts
 * @property {string} tag
 * @property {string | null} packageVersion  Version in package.json at the tagged commit.
 * @property {string} objectType  `git cat-file -t <tag>`: "tag" when annotated.
 * @property {boolean} onMain  The tagged commit is part of main.
 * @property {string | null} changelog  CHANGELOG.md at the tagged commit.
 */

/**
 * @param {ReleaseTagFacts} facts
 * @returns {string[]} problems found; empty when the tag is a valid release
 */
export function checkReleaseTag({ tag, packageVersion, objectType, onMain, changelog }) {
  const problems = []

  if (!RELEASE_RE.test(tag)) {
    problems.push(
      `Tag "${tag}" is not a release number. Releases are named X.Y.Z with no prefix or suffix (for example 2.0.11).`,
    )
    // Everything below compares against the tag name, which is not usable.
    return problems
  }

  if (packageVersion === null) {
    problems.push('package.json at the tagged commit has no readable "version".')
  } else if (packageVersion !== tag) {
    problems.push(
      `package.json says ${packageVersion} but the tag is ${tag}. Tag the commit that bumps the version to ${tag}.`,
    )
  }

  if (objectType !== 'tag') {
    problems.push(
      `Tag ${tag} is lightweight. Create releases with an annotated tag: git tag -a ${tag} -m "ARI ${tag}"`,
    )
  }

  if (!onMain) {
    problems.push(`The commit tagged ${tag} is not on main. Releases are tagged on main only.`)
  }

  if (changelog === null) {
    problems.push('CHANGELOG.md is missing at the tagged commit.')
  } else if (!changelogHasEntry(changelog, tag)) {
    problems.push(`CHANGELOG.md has no "## ${tag}" entry. Users are shown it when they update.`)
  }

  return problems
}

/**
 * Does the changelog have a heading for this version? Matches `## 2.0.11`,
 * optionally followed by a date or note, and never a longer version that only
 * starts the same way (2.0.1 must not match 2.0.11).
 *
 * @param {string} changelog
 * @param {string} version
 */
export function changelogHasEntry(changelog, version) {
  const escaped = version.replace(/\./g, '\\.')
  return new RegExp(`^##\\s+\\[?${escaped}\\]?(?![\\d.])`, 'm').test(changelog)
}
