#!/usr/bin/env node
/**
 * Guard against a stale Turbopack persistent dev cache (.next/dev).
 *
 * Why this exists: commit f5ed7e9 renamed middleware.ts -> proxy.ts (the Next 16
 * convention). Turbopack's persistent dev cache — on by default since Next 16.1 —
 * kept a compiled middleware.js hardwired to the removed `[project]/middleware.ts`,
 * so every request failed with MODULE_UNPARSABLE and the dev server leaked memory
 * until it OOMed (see vercel/next.js#94915). The upstream cache never invalidates
 * on convention-entrypoint renames, so any `git pull` that reshapes the module
 * graph can leave an existing install broken until `.next/dev` is deleted.
 *
 * What it does, in order (runs first in `predev`, i.e. before every `next dev`):
 *   1. Targeted shim: if the compiled middleware chunk still references
 *      `[project]/middleware.ts` and no middleware.ts exists, clear the cache.
 *      (Heals installs without git; remove once the f5ed7e9 window has passed.)
 *   2. Generic guard: remember the git HEAD the cache was last used at in
 *      .ari/cache-guard.json. When HEAD has moved, clear the cache only if the
 *      diff touches a module-graph-shaping root file (entrypoints, next config,
 *      dependency files). No stamp at all means pre-guard history — clear once.
 *
 * IMPORTANT: this script must NEVER fail the caller — `predev` chains with `&&`,
 * so any error here would block `pnpm dev`. Everything is wrapped; on any
 * failure it warns and lets the dev server start.
 *
 * Set ARI_SKIP_CACHE_GUARD=1 to skip entirely.
 */

import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DEV_CACHE_DIR = path.join(ROOT, '.next', 'dev')
const LOCK_PATH = path.join(DEV_CACHE_DIR, 'lock')
const COMPILED_MIDDLEWARE = path.join(DEV_CACHE_DIR, 'server', 'middleware.js')
const STAMP_PATH = path.join(ROOT, '.ari', 'cache-guard.json')

/**
 * Root files whose changes reshape the module graph in ways Turbopack's
 * persistent cache has mishandled (convention entrypoints appearing/vanishing,
 * dependency or alias changes). Content-only edits to ordinary source files
 * hash-invalidate correctly and are deliberately not listed. Exact
 * root-relative paths — a module's nested package.json doesn't belong here.
 */
const GRAPH_SHAPING_FILES = new Set([
  'proxy.ts',
  'middleware.ts',
  'instrumentation.ts',
  'instrumentation-client.ts',
  'next.config.mjs',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'tsconfig.json',
])

/** First graph-shaping path in the changed set, or null. Pure — unit tested. */
export function isGraphShaping(changedPaths) {
  for (const p of changedPaths) {
    if (GRAPH_SHAPING_FILES.has(p)) return p
  }
  return null
}

/**
 * True when a compiled middleware chunk references the removed middleware.ts.
 * A healthy post-rename cache still emits server/middleware.js, but it
 * references `[project]/proxy.ts` — so the check must be on content, not on
 * the file's existence. The `[project]/` prefix is Turbopack's virtual path
 * and is forward-slash on every platform. Pure — unit tested.
 */
export function isStaleMiddlewareShim(compiledSource, middlewareTsExists) {
  return !middlewareTsExists && compiledSource.includes('[project]/middleware.ts')
}

/** Run a git command in ROOT; null on any failure (no git, no repo, bad SHA). */
function git(args) {
  try {
    return execSync(`git ${args}`, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return null
  }
}

/** True when .next/dev/lock names a process that is still alive. */
function devServerAlive() {
  try {
    const { pid } = JSON.parse(fs.readFileSync(LOCK_PATH, 'utf8'))
    if (!pid) return false
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function readStamp() {
  try {
    const stamp = JSON.parse(fs.readFileSync(STAMP_PATH, 'utf8'))
    return typeof stamp?.head === 'string' && stamp.head ? stamp : null
  } catch {
    return null
  }
}

function writeStamp(head) {
  try {
    fs.mkdirSync(path.dirname(STAMP_PATH), { recursive: true })
    fs.writeFileSync(
      STAMP_PATH,
      JSON.stringify({ head, updatedAt: new Date().toISOString(), guardVersion: 1 }, null, 2) +
        '\n',
    )
  } catch (err) {
    console.warn(`[cache-guard] Could not write ${STAMP_PATH}: ${err.message}`)
  }
}

/** Delete .next/dev. Returns false when the delete itself failed. */
function clearDevCache(reason) {
  try {
    fs.rmSync(DEV_CACHE_DIR, { recursive: true, force: true })
    console.log(`✅ [cache-guard] Cleared Turbopack dev cache (.next/dev): ${reason}`)
    return true
  } catch (err) {
    console.warn(
      `⚠ [cache-guard] Could not delete .next/dev (${err.message}). ` +
        'Stop any running dev server and delete the .next folder manually.',
    )
    return false
  }
}

export default function devCacheGuard() {
  try {
    if (process.env.ARI_SKIP_CACHE_GUARD === '1') {
      console.log('[cache-guard] Skipped (ARI_SKIP_CACHE_GUARD=1).')
      return
    }

    const head = git('rev-parse HEAD')

    if (!fs.existsSync(DEV_CACHE_DIR)) {
      // Nothing to clear, but record the baseline so the NEXT run compares
      // against the HEAD this fresh cache is about to be built at.
      if (head) writeStamp(head)
      return
    }

    if (devServerAlive()) {
      // predev runs before our own `next dev` spawns, so a live lock always
      // belongs to another server — never delete the cache under it. No stamp
      // write either: the next clean start must re-evaluate from scratch.
      console.warn(
        '⚠ [cache-guard] Another dev server appears to be running — skipping cache maintenance.',
      )
      return
    }

    if (fs.existsSync(COMPILED_MIDDLEWARE)) {
      const source = fs.readFileSync(COMPILED_MIDDLEWARE, 'utf8')
      const middlewareTsExists = fs.existsSync(path.join(ROOT, 'middleware.ts'))
      if (isStaleMiddlewareShim(source, middlewareTsExists)) {
        clearDevCache(
          'compiled middleware references the removed middleware.ts (proxy.ts migration)',
        )
        if (head) writeStamp(head)
        return
      }
    }

    if (!head) {
      // No git (zip install): the shim above is all we can safely do — clearing
      // on every start here would throw away a healthy cache each boot.
      console.log('[cache-guard] No git history available — stale-entrypoint check only.')
      return
    }

    const stamp = readStamp()
    if (stamp?.head === head) return

    if (!stamp) {
      clearDevCache('no previous git state recorded — one-time reset')
      writeStamp(head)
      return
    }

    // --no-renames so a rename lists both its old and new path.
    const diff = git(`diff --name-only --no-renames ${stamp.head} ${head}`)
    if (diff === null) {
      // Old SHA unreachable (gc, shallow clone, force-push) — err safe.
      clearDevCache(`previous git state ${stamp.head.slice(0, 7)} is unreachable`)
    } else {
      const hit = isGraphShaping(diff.split('\n').filter(Boolean))
      if (hit) clearDevCache(`${hit} changed since the cache was last used`)
    }
    writeStamp(head)
  } catch (err) {
    console.warn(`[cache-guard] Skipped due to error: ${err.message}`)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  devCacheGuard()
}
