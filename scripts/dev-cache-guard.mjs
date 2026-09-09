#!/usr/bin/env node
/**
 * Guard against a stale Turbopack persistent dev cache (.next/dev).
 *
 * Why this exists: commit f5ed7e9 renamed middleware.ts -> proxy.ts (the Next 16
 * convention). Turbopack's persistent dev cache — on by default since Next 16.1 —
 * kept a compiled middleware.js hardwired to the removed `[project]/middleware.ts`,
 * so every request failed with MODULE_UNPARSABLE and the dev server leaked memory
 * until it OOMed (see vercel/next.js#94915). The upstream cache never invalidates
 * on convention-entrypoint renames, so any update that reshapes the module graph
 * can leave an existing install broken until `.next/dev` is deleted.
 *
 * What it does, in order (runs first in `predev`, i.e. before every `next dev`):
 *   1. Targeted shim: if the compiled middleware chunk still references
 *      `[project]/middleware.ts` and no middleware.ts exists, clear the cache.
 *      (Remove once the f5ed7e9 window has passed.)
 *   2. Generic guard: hash the module-graph-shaping root files (convention
 *      entrypoints, next config, dependency files) into .ari/cache-guard.json.
 *      When any of them changed since the cache was last used — however the
 *      change arrived: git pull, module install, hand edit — clear the cache.
 *      package.json is hashed with its `version` field stripped so routine
 *      release bumps don't throw away a healthy multi-GB cache.
 *
 * Deliberately git-free: content hashes see uncommitted changes, work in
 * archive installs without history, and don't care whether the checkout lives
 * inside some outer repository.
 *
 * IMPORTANT: this script must NEVER fail the caller — `predev` chains with `&&`,
 * so any error here would block `pnpm dev`. Everything is wrapped; on any
 * failure it warns and lets the dev server start.
 *
 * Set ARI_SKIP_CACHE_GUARD=1 to skip entirely.
 */

import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DEV_CACHE_DIR = path.join(ROOT, '.next', 'dev')
const LOCK_PATH = path.join(DEV_CACHE_DIR, 'lock')
const COMPILED_MIDDLEWARE = path.join(DEV_CACHE_DIR, 'server', 'middleware.js')
const STAMP_PATH = path.join(ROOT, '.ari', 'cache-guard.json')
const GUARD_VERSION = 2

/**
 * Root files whose changes reshape the module graph in ways Turbopack's
 * persistent cache has mishandled (convention entrypoints appearing/vanishing,
 * dependency or alias changes). Content-only edits to ordinary source files
 * hash-invalidate correctly and are deliberately not listed. Exact
 * root-relative paths — a module's nested package.json doesn't belong here.
 */
export const GRAPH_SHAPING_FILES = [
  'proxy.ts',
  'middleware.ts',
  'instrumentation.ts',
  'instrumentation-client.ts',
  'next.config.mjs',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'tsconfig.json',
]

/**
 * package.json content with the `version` field removed, so version-only
 * release bumps (about half this repo's package.json commits) don't count as
 * graph-shaping. Unparseable input is returned as-is — a malformed file still
 * hashes deterministically. Pure — unit tested.
 */
export function normalizePackageJson(source) {
  try {
    const parsed = JSON.parse(source)
    if (parsed && typeof parsed === 'object') delete parsed.version
    return JSON.stringify(parsed)
  } catch {
    return source
  }
}

/**
 * First filename whose hash differs between two stamp hash maps (a file
 * appearing or disappearing counts), or null when they match. Pure — unit
 * tested.
 */
export function firstChangedFile(oldHashes, newHashes) {
  for (const name of GRAPH_SHAPING_FILES) {
    if ((oldHashes?.[name] ?? null) !== (newHashes?.[name] ?? null)) return name
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

/** Hash map for every graph-shaping file currently on disk (absent = omitted). */
function computeGraphHashes() {
  const hashes = {}
  for (const name of GRAPH_SHAPING_FILES) {
    let content
    try {
      content = fs.readFileSync(path.join(ROOT, name), 'utf8')
    } catch {
      continue
    }
    if (name === 'package.json') content = normalizePackageJson(content)
    hashes[name] = crypto.createHash('sha256').update(content).digest('hex')
  }
  return hashes
}

/**
 * True when .next/dev/lock names a live process that plausibly is a dev
 * server. Next deliberately leaves the lock behind on unclean exits (the OOM
 * crash this guard exists for), so a bare pid-alive probe would wedge the
 * guard forever once the OS recycles the pid — hence the process-name check.
 * EPERM means the pid exists but belongs to another user: treat as alive.
 */
function devServerAlive() {
  let pid
  try {
    pid = JSON.parse(fs.readFileSync(LOCK_PATH, 'utf8')).pid
  } catch {
    return false
  }
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
  } catch (err) {
    return err.code === 'EPERM'
  }
  try {
    const comm =
      process.platform === 'win32'
        ? execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], {
            encoding: 'utf8',
          })
        : execFileSync('ps', ['-p', String(pid), '-o', 'comm='], { encoding: 'utf8' })
    return /node|next/i.test(comm)
  } catch {
    return true // pid is alive but uninspectable — err on the safe side
  }
}

function readStamp() {
  try {
    const stamp = JSON.parse(fs.readFileSync(STAMP_PATH, 'utf8'))
    if (stamp?.guardVersion !== GUARD_VERSION) return null
    return stamp.hashes && typeof stamp.hashes === 'object' ? stamp : null
  } catch {
    return null
  }
}

/** Atomic (tmp + rename) so an interrupted write can't leave a corrupt stamp. */
function writeStamp(hashes) {
  try {
    fs.mkdirSync(path.dirname(STAMP_PATH), { recursive: true })
    const tmp = STAMP_PATH + '.tmp'
    fs.writeFileSync(
      tmp,
      JSON.stringify(
        { guardVersion: GUARD_VERSION, updatedAt: new Date().toISOString(), hashes },
        null,
        2,
      ) + '\n',
    )
    fs.renameSync(tmp, STAMP_PATH)
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

    const hashes = computeGraphHashes()

    if (!fs.existsSync(DEV_CACHE_DIR)) {
      // Nothing to clear, but record the baseline the fresh cache is about to
      // be built against.
      writeStamp(hashes)
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
        // Stamp only after a successful delete — a failed delete must be
        // retried next start, not recorded as done.
        if (
          clearDevCache(
            'compiled middleware references the removed middleware.ts (proxy.ts migration)',
          )
        ) {
          writeStamp(hashes)
        }
        return
      }
    }

    const stamp = readStamp()
    if (!stamp) {
      // No baseline to compare against (fresh guard rollout, deleted or
      // corrupt stamp). The shim above already catches the known breakage —
      // don't throw away a possibly healthy cache; just start tracking.
      writeStamp(hashes)
      return
    }

    const changed = firstChangedFile(stamp.hashes, hashes)
    if (!changed) return
    if (clearDevCache(`${changed} changed since the cache was last used`)) {
      writeStamp(hashes)
    }
  } catch (err) {
    console.warn(`[cache-guard] Skipped due to error: ${err.message}`)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  devCacheGuard()
}
