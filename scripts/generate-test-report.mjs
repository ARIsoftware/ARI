#!/usr/bin/env node
/**
 * Generate a static unit-test report for the /health "Unit Tests" tab.
 *
 * Runs the Vitest suite with the JSON reporter and writes the result to
 * lib/generated/test-report.json (gitignored, regenerated on predev/prebuild —
 * same lifecycle as lib/generated/openapi.json).
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

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const REPO_ROOT = path.resolve(path.dirname(__filename), '..')
const OUTPUT_PATH = path.join(REPO_ROOT, 'lib', 'generated', 'test-report.json')
const VITEST_ENTRY = path.join(REPO_ROOT, 'node_modules', 'vitest', 'vitest.mjs')

const generatedAt = new Date().toISOString()

function writeFallback(reason) {
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
    console.warn(`[test-report] Could not write fallback report: ${err instanceof Error ? err.message : String(err)}`)
  }
}

try {
  if (process.env.ARI_SKIP_TEST_REPORT === '1') {
    console.log('[test-report] Skipped (ARI_SKIP_TEST_REPORT=1) — leaving any existing report as-is.')
  } else {
    fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true })

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
      { cwd: REPO_ROOT, stdio: 'inherit', env: process.env }
    )

    if (!fs.existsSync(OUTPUT_PATH)) {
      // Vitest never wrote a report: failed to launch (e.g. devDeps pruned so the
      // entry is missing) or crashed before writing. result.error distinguishes
      // "couldn't even start" from "ran but produced nothing".
      writeFallback(
        result.error
          ? `Vitest failed to run: ${result.error.message}`
          : 'Vitest produced no report file (crash or collect error)'
      )
    } else {
      // Fresh report on disk (may contain failing tests — that's fine). Stamp the
      // generation time and rewrite.
      const report = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8'))
      report.generatedAt = generatedAt
      fs.writeFileSync(OUTPUT_PATH, JSON.stringify(report) + '\n', 'utf8')
      const total = report.numTotalTests ?? 0
      const passed = report.numPassedTests ?? 0
      const pct = total > 0 ? Math.floor((passed / total) * 100) : 0
      console.log(
        `[test-report] Wrote ${path.relative(REPO_ROOT, OUTPUT_PATH)} — ${passed}/${total} passed (${pct}%).`
      )
    }
  }
} catch (err) {
  // A parse error on a partially-written file, or any unexpected failure, lands
  // here — write a fallback so downstream always has valid JSON.
  writeFallback(`Failed to generate report: ${err instanceof Error ? err.message : String(err)}`)
}

// Never fail the caller (predev/prebuild) on test failures or report issues.
process.exit(0)
