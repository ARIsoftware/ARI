#!/usr/bin/env node
/**
 * Generate a static unit-test report for the /health "Unit Tests" tab.
 *
 * Runs the Vitest suite with the JSON reporter and writes the result to
 * lib/generated/test-report.json (gitignored, regenerated on predev/prebuild —
 * same lifecycle as lib/generated/openapi.json).
 *
 * The run is skipped when nothing that could change its outcome has changed
 * since the last report. A fingerprint of the inputs — the commit at HEAD, the
 * size and modification time of every file git sees as modified, staged,
 * deleted or untracked, and the Node version — is stored in the report as
 * `inputsFingerprint`; when it matches, and that report passed, the report is
 * kept as-is and `generatedAt` keeps saying when the tests really ran. Anything
 * gitignored (node_modules, .next, lib/generated, .env*) is derived from those
 * inputs or irrelevant to the tests, so it is left out on purpose. A failing
 * report is never reused: it runs again on every boot until it passes, so a
 * flaky failure clears itself. Set ARI_FORCE_TEST_REPORT=1 to run regardless.
 *
 * IMPORTANT: a FAILING test must NOT fail this script — the whole point is to
 * SHOW failures in the app, not block `pnpm dev` / a deploy. Vitest exits
 * non-zero when tests fail but still writes the report, so we ignore its exit
 * code and only care that a valid report file ends up on disk. If Vitest
 * crashes hard (collect error, no file), we write a minimal fallback so the
 * route/tab always have valid JSON to read. The whole body is wrapped so no
 * error here can ever fail the caller.
 *
 * Set ARI_SKIP_TEST_REPORT=1 to skip the (expensive) Vitest run entirely — used
 * by CI, which already runs the suite in a dedicated `test:coverage` step.
 */

import { execFileSync, spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isEntryScript } from './lib/entry-script.js'

const selfPath = fileURLToPath(import.meta.url)
const REPO_ROOT = path.resolve(path.dirname(selfPath), '..')
const OUTPUT_PATH = path.join(REPO_ROOT, 'lib', 'generated', 'test-report.json')
const VITEST_ENTRY = path.join(REPO_ROOT, 'node_modules', 'vitest', 'vitest.mjs')

/** Bump when the fingerprint's inputs or layout change, so old reports are not reused. */
export const FINGERPRINT_VERSION = 2

/** The local calendar day of `date`, as YYYY-MM-DD. */
export function localDay(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * Paths out of `git status --porcelain=v1 -z --no-renames --untracked-files=all`.
 * Each record is "XY path" ended by NUL; --no-renames guarantees one path per
 * record, and -z leaves the path unquoted whatever characters it holds.
 */
export function parseStatusPaths(output) {
  const paths = []
  for (const record of output.split('\0')) {
    if (record.length > 3 && record[2] === ' ') paths.push(record.slice(3))
  }
  return paths
}

/**
 * The fingerprint for one set of inputs. Entries are sorted by path here, so
 * the order git listed them in never matters. A deleted file has size -1.
 * The calendar day is an input too: some tests read the real clock, so a
 * report is good for the day it was written and no longer.
 */
export function fingerprintFromParts({ head, entries, nodeVersion, platform, day }) {
  const hash = crypto.createHash('sha256')
  hash.update(`${FINGERPRINT_VERSION}\n${nodeVersion}\n${platform}\n${day}\n${head}\n`)
  for (const entry of [...entries].sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
  )) {
    hash.update(`${entry.path}\0${entry.size}\0${entry.mtimeMs}\n`)
  }
  return hash.digest('hex')
}

/**
 * Fingerprint the test inputs of the repository that holds `root`, or null when
 * git cannot answer (no git, not a repository, no commit yet) — the caller then
 * runs the tests, which is always the safe answer. Only local, read-only git
 * commands run; GIT_OPTIONAL_LOCKS=0 keeps `status` from touching the index, so
 * it never waits on or conflicts with another git process.
 */
export function computeInputsFingerprint(root, options = {}) {
  const env = { ...(options.env ?? process.env), GIT_OPTIONAL_LOCKS: '0' }
  const git = (...args) =>
    execFileSync('git', ['-C', root, ...args], {
      encoding: 'utf8',
      env,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  let head
  let toplevel
  let status
  try {
    const lines = git('rev-parse', 'HEAD', '--show-toplevel').split('\n')
    head = lines[0]
    toplevel = lines[1]
    status = git('status', '--porcelain=v1', '-z', '--no-renames', '--untracked-files=all')
  } catch {
    return null
  }
  if (!/^[0-9a-f]{40,64}$/.test(head) || !toplevel) return null

  const entries = parseStatusPaths(status).map((rel) => {
    try {
      const stat = fs.statSync(path.join(toplevel, rel))
      return { path: rel, size: stat.size, mtimeMs: stat.mtimeMs }
    } catch {
      return { path: rel, size: -1, mtimeMs: -1 }
    }
  })
  return fingerprintFromParts({
    head,
    entries,
    nodeVersion: options.nodeVersion ?? process.version,
    platform: options.platform ?? `${process.platform}-${process.arch}`,
    day: options.day ?? localDay(),
  })
}

/**
 * Whether an existing report can stand in for a fresh run: it must have been
 * produced from exactly these inputs, and it must have passed. Reports that
 * failed, were fallbacks, or ran no tests are never reused.
 */
export function canReuseReport(report, fingerprint) {
  if (typeof fingerprint !== 'string' || fingerprint.length === 0) return false
  if (!report || typeof report !== 'object') return false
  if (report.success !== true) return false
  if (!(Number.isInteger(report.numTotalTests) && report.numTotalTests > 0)) return false
  if (report.numFailedTests) return false
  return report.inputsFingerprint === fingerprint
}

function readReport() {
  try {
    return JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8'))
  } catch {
    return null
  }
}

function writeFallback(generatedAt, reason) {
  try {
    const fallback = {
      generatedAt,
      success: false,
      error: reason,
      numTotalTests: 0,
      numPassedTests: 0,
      numFailedTests: 0,
      numPendingTests: 0,
      testResults: [],
    }
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(fallback, null, 2) + '\n', 'utf8')
    console.warn(`[test-report] ${reason} — wrote fallback report.`)
  } catch (err) {
    // Even the fallback write failed — log and move on; never throw.
    console.warn(
      `[test-report] Could not write fallback report: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}

export default function generateTestReport() {
  const generatedAt = new Date().toISOString()
  const relOutput = path.relative(REPO_ROOT, OUTPUT_PATH)
  try {
    if (process.env.ARI_SKIP_TEST_REPORT === '1') {
      console.log(
        '[test-report] Skipped (ARI_SKIP_TEST_REPORT=1) — leaving any existing report as-is.',
      )
      return
    }
    if (process.env.VERCEL) {
      // Vercel builds (including zero-config Deploy Button installs) shouldn't
      // spend build minutes running the test suite — CI already covers it.
      console.log('[test-report] Skipped (Vercel build) — leaving any existing report as-is.')
      return
    }

    fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true })

    // Fingerprint BEFORE the run: an edit made while the tests run then differs
    // from what is stored, and the next boot runs them again.
    const fingerprint = computeInputsFingerprint(REPO_ROOT)
    if (process.env.ARI_FORCE_TEST_REPORT !== '1') {
      const previous = readReport()
      if (canReuseReport(previous, fingerprint)) {
        console.log(
          `[test-report] No changes since ${previous.generatedAt} — reusing ${relOutput} ` +
            `(${previous.numPassedTests}/${previous.numTotalTests} passed).`,
        )
        return
      }
    }

    // Remove any prior report FIRST so that a run which fails to produce a fresh
    // one can't be mistaken for current data. After the run, the file exists iff
    // Vitest actually wrote it this run — otherwise we write an honest fallback
    // instead of re-stamping stale results with a new timestamp.
    try {
      fs.rmSync(OUTPUT_PATH, { force: true })
    } catch {
      /* ignore — a missing file is fine */
    }

    // Plain run (no --coverage) — pass/fail only; coverage has its own report.
    // Invoke Vitest's JS entry via the current Node binary so it works
    // cross-platform without relying on a .bin/ shim on PATH.
    const result = spawnSync(
      process.execPath,
      [VITEST_ENTRY, 'run', '--reporter=json', `--outputFile=${OUTPUT_PATH}`],
      // The slow git-lab suites (*.lab.test.ts) are left to `pnpm test` and CI:
      // this runs on every dev boot.
      { cwd: REPO_ROOT, stdio: 'inherit', env: { ...process.env, ARI_SKIP_LAB_TESTS: '1' } },
    )

    if (!fs.existsSync(OUTPUT_PATH)) {
      // Vitest never wrote a report: failed to launch (e.g. devDeps pruned so the
      // entry is missing) or crashed before writing. result.error distinguishes
      // "couldn't even start" from "ran but produced nothing".
      writeFallback(
        generatedAt,
        result.error
          ? `Vitest failed to run: ${result.error.message}`
          : 'Vitest produced no report file (crash or collect error)',
      )
      return
    }

    // Fresh report on disk (may contain failing tests — that's fine). Stamp the
    // generation time and the inputs it was produced from, and rewrite.
    const report = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8'))
    report.generatedAt = generatedAt
    if (fingerprint) report.inputsFingerprint = fingerprint
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(report) + '\n', 'utf8')
    const total = report.numTotalTests ?? 0
    const passed = report.numPassedTests ?? 0
    const pct = total > 0 ? Math.floor((passed / total) * 100) : 0
    console.log(`[test-report] Wrote ${relOutput} — ${passed}/${total} passed (${pct}%).`)
  } catch (err) {
    // A parse error on a partially-written file, or any unexpected failure, lands
    // here — write a fallback so downstream always has valid JSON.
    writeFallback(
      generatedAt,
      `Failed to generate report: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}

// Run only as the entry script, never when a test imports the module.
if (isEntryScript(import.meta.url)) {
  generateTestReport()
  // Never fail the caller (predev/prebuild) on test failures or report issues.
  process.exit(0)
}
