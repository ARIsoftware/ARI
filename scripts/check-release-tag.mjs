#!/usr/bin/env node
/**
 * Verify that a pushed tag is a valid ARI release. Run by CI on every tag push;
 * run it by hand before pushing with:  node scripts/check-release-tag.mjs 2.0.11
 * (compares with your local main; pass another ref as the second argument)
 *
 * Exits 1 and lists what is wrong when the tag is not a valid release.
 */
import { spawnSync } from 'node:child_process'
import { checkReleaseTag } from './lib/release-tag.js'

const tag = process.argv[2] || process.env.GITHUB_REF_NAME
// By hand, before pushing, the bump commit only exists on the local main. CI
// passes origin/main, which is what a pushed tag has to be part of.
const mainRef = process.argv[3] || process.env.ARI_MAIN_REF || 'main'

if (!tag) {
  console.error('Usage: node scripts/check-release-tag.mjs <tag> [main-ref]')
  process.exit(1)
}

const git = (...args) => {
  const res = spawnSync('git', args, { encoding: 'utf8' })
  return { ok: res.status === 0, out: (res.stdout || '').trim() }
}

if (!git('rev-parse', '-q', '--verify', `refs/tags/${tag}`).ok) {
  console.error(`✘ There is no tag named ${tag} in this repository.`)
  process.exit(1)
}

const pkg = git('show', `refs/tags/${tag}:package.json`)
let packageVersion = null
try {
  const version = JSON.parse(pkg.out).version
  if (typeof version === 'string' && version) packageVersion = version
} catch {
  /* reported by checkReleaseTag */
}

const changelog = git('show', `refs/tags/${tag}:CHANGELOG.md`)

const problems = checkReleaseTag({
  tag,
  packageVersion,
  objectType: git('cat-file', '-t', `refs/tags/${tag}`).out,
  onMain: git('merge-base', '--is-ancestor', `refs/tags/${tag}^{commit}`, mainRef).ok,
  changelog: changelog.ok ? changelog.out : null,
})

if (problems.length > 0) {
  console.error(`✘ ${tag} is not a valid ARI release:`)
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}
console.log(`✔ ${tag} is a valid ARI release.`)
