/**
 * Module npm Dependency Installer
 *
 * Installs the packages declared in a module's `npmDependencies` manifest
 * field into the host project. Called by the module download flow after the
 * zip is extracted and before schema.sql runs.
 *
 * Two execution modes:
 * - Local dev:  spawns `pnpm add <pkg>@<ver> ...` against the project root,
 *               touches importing files to nudge Turbopack's resolution cache.
 * - Vercel:     mutates a copy of root package.json in memory and returns it
 *               to the caller, which commits it to GitHub alongside the
 *               module files. The next Vercel deploy's `pnpm install` picks
 *               up the new deps.
 *
 * Conflict policy: if the user's root package.json already has the package
 * at an incompatible range, the install aborts. We do not silently upgrade
 * framework deps (react, next, etc.) from inside a module install.
 *
 * Server-side only.
 */

import { readFile, readdir, utimes } from 'fs/promises'
import { join } from 'path'
import { spawn } from 'child_process'
import type { Dirent } from 'fs'
import { satisfies, rangeAnchor } from '../../scripts/lib/semver-range.js'

const MAX_DEPS_PER_MODULE = 25
const PNPM_TIMEOUT_MS = 180_000
const NPM_NAME_RE = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/
const FORBIDDEN_SPEC_TOKENS = ['git:', 'http:', 'https:', 'file:', 'link:', 'workspace:', 'npm:', '..']

export type NpmInstallEvent =
  | { type: 'start'; packages: string[] }
  | { type: 'already-satisfied'; packages: string[] }
  | { type: 'spawn'; command: string }
  | { type: 'stderr'; line: string }
  | { type: 'cache-bust'; touched: number }
  | { type: 'done'; durationMs: number }

export type NpmInstallConflict = {
  name: string
  declared: string
  existing: string
}

export type NpmInstallResult =
  | {
      ok: true
      installed: string[]
      alreadySatisfied: string[]
      skipped: 'vercel' | 'none' | 'empty'
      mutatedPackageJson?: string // serialized JSON, only when skipped === 'vercel'
    }
  | { ok: false; error: string; conflict?: NpmInstallConflict }

type InstallOpts = {
  isVercel: boolean
  githubConfigured?: boolean
  onEvent?: (e: NpmInstallEvent) => void
  abortSignal?: AbortSignal
}

// Module-level mutex. Chained Promise pattern: each caller's work runs after
// the previous caller's settles, so two near-simultaneous /api/modules/download
// requests don't race on pnpm's lockfile or on package.json writes.
let installQueue: Promise<unknown> = Promise.resolve()
let queueActive = false

export async function installModuleNpmDeps(
  moduleId: string,
  deps: Record<string, string> | undefined,
  moduleDir: string,
  opts: InstallOpts
): Promise<NpmInstallResult> {
  const startedAt = Date.now()
  const entries = Object.entries(deps ?? {})

  if (entries.length === 0) {
    return { ok: true, installed: [], alreadySatisfied: [], skipped: 'empty' }
  }

  if (entries.length > MAX_DEPS_PER_MODULE) {
    return {
      ok: false,
      error: `Module ${moduleId} declares ${entries.length} npm dependencies; limit is ${MAX_DEPS_PER_MODULE}.`,
    }
  }

  for (const [name, spec] of entries) {
    if (!NPM_NAME_RE.test(name)) {
      return { ok: false, error: `Invalid npm package name: "${name}"` }
    }
    if (typeof spec !== 'string' || spec.length === 0 || spec.length > 100) {
      return { ok: false, error: `Invalid version spec for "${name}": "${spec}"` }
    }
    for (const token of FORBIDDEN_SPEC_TOKENS) {
      if (spec.includes(token)) {
        return {
          ok: false,
          error: `Forbidden version spec for "${name}": "${spec}" (contains ${token})`,
        }
      }
    }
  }

  if (opts.isVercel && opts.githubConfigured === false) {
    return {
      ok: false,
      error:
        'Cannot install npm dependencies on Vercel without GitHub configured. Set GITHUB_TOKEN so the updated package.json can be committed to your repository.',
    }
  }

  // Queue behind any in-flight install. The .catch ensures one caller's
  // failure does not abort the queue for subsequent callers.
  const previous = installQueue
  const wasBusy = queueActive
  const myWork = previous
    .catch(() => {})
    .then(async () => {
      if (wasBusy) {
        opts.onEvent?.({ type: 'spawn', command: 'waiting for previous install to finish...' })
      }
      queueActive = true
      try {
        return await runInstall(moduleId, entries, moduleDir, opts, startedAt)
      } finally {
        queueActive = false
      }
    })
  installQueue = myWork
  return myWork
}

async function runInstall(
  moduleId: string,
  entries: [string, string][],
  moduleDir: string,
  opts: InstallOpts,
  startedAt: number
): Promise<NpmInstallResult> {
  const rootPkgPath = join(process.cwd(), 'package.json')
  let rootPkg: any
  try {
    rootPkg = JSON.parse(await readFile(rootPkgPath, 'utf-8'))
  } catch (err) {
    return { ok: false, error: `Failed to read root package.json: ${(err as Error).message}` }
  }

  const rootDeps: Record<string, string> = { ...(rootPkg.dependencies ?? {}) }
  const alreadySatisfied: string[] = []
  const toInstall: [string, string][] = []

  for (const [name, declared] of entries) {
    const existing = rootDeps[name]
    if (!existing) {
      toInstall.push([name, declared])
      continue
    }
    const existingAnchor = rangeAnchor(existing)
    if (!existingAnchor) {
      // Root has it but in a form we can't compare (e.g. `*`, git URL).
      // Treat as satisfied — we won't second-guess it.
      alreadySatisfied.push(name)
      continue
    }
    const result = satisfies(existingAnchor, declared)
    if (result === true) {
      alreadySatisfied.push(name)
    } else if (result === false) {
      return {
        ok: false,
        error: `Module ${moduleId} requires ${name}@${declared}, but your project has ${name}@${existing}. Resolve the version conflict manually, then re-install.`,
        conflict: { name, declared, existing },
      }
    } else {
      // satisfies returned null — unrecognized range form. Refuse to proceed.
      return {
        ok: false,
        error: `Cannot compare version ranges for ${name}: declared "${declared}", existing "${existing}". Use a simple range (e.g. ^1.2.3).`,
      }
    }
  }

  if (alreadySatisfied.length > 0) {
    opts.onEvent?.({ type: 'already-satisfied', packages: alreadySatisfied })
  }

  if (toInstall.length === 0) {
    opts.onEvent?.({ type: 'done', durationMs: Date.now() - startedAt })
    return { ok: true, installed: [], alreadySatisfied, skipped: 'none' }
  }

  opts.onEvent?.({ type: 'start', packages: toInstall.map(([n, v]) => `${n}@${v}`) })

  if (opts.isVercel) {
    // Mutate package.json in memory; caller commits it to GitHub.
    const merged = { ...rootPkg, dependencies: { ...rootDeps } }
    for (const [name, spec] of toInstall) {
      merged.dependencies[name] = spec
    }
    // Re-sort dependencies alphabetically to match pnpm's on-disk format.
    const sortedDeps: Record<string, string> = {}
    for (const k of Object.keys(merged.dependencies).sort()) {
      sortedDeps[k] = merged.dependencies[k]
    }
    merged.dependencies = sortedDeps
    opts.onEvent?.({ type: 'done', durationMs: Date.now() - startedAt })
    return {
      ok: true,
      installed: toInstall.map(([n]) => n),
      alreadySatisfied,
      skipped: 'vercel',
      mutatedPackageJson: JSON.stringify(merged, null, 2) + '\n',
    }
  }

  // Local: spawn pnpm.
  const spawnResult = await spawnPnpmAdd(toInstall, opts)
  if (!spawnResult.ok) return spawnResult

  // Touch importing files in the module to nudge Turbopack's resolution cache.
  // Best-effort: undocumented behavior in Next 16, so failure is silent.
  try {
    const touched = await touchImporters(moduleDir, toInstall.map(([n]) => n))
    if (touched > 0) opts.onEvent?.({ type: 'cache-bust', touched })
  } catch {
    // ignore
  }

  opts.onEvent?.({ type: 'done', durationMs: Date.now() - startedAt })
  return {
    ok: true,
    installed: toInstall.map(([n]) => n),
    alreadySatisfied,
    skipped: 'none',
  }
}

async function spawnPnpmAdd(
  toInstall: [string, string][],
  opts: InstallOpts
): Promise<NpmInstallResult> {
  const addArgs = ['add', ...toInstall.map(([n, v]) => `${n}@${v}`)]
  // Two strategies, tried in order. On corepack-managed setups (Node 20+
  // default) the `pnpm` shim may not be on PATH; `corepack pnpm ...` works.
  const attempts: { cmd: string; args: string[] }[] = [
    { cmd: 'pnpm', args: addArgs },
    { cmd: 'corepack', args: ['pnpm', ...addArgs] },
  ]
  let lastError: string | null = null

  for (const { cmd, args } of attempts) {
    opts.onEvent?.({ type: 'spawn', command: `${cmd} ${args.join(' ')}` })

    const result = await new Promise<{ code: number | null; stderr: string; spawnError?: Error }>(
      (resolve) => {
        const child = spawn(cmd, args, {
          cwd: process.cwd(),
          env: { ...process.env, CI: '1' },
          shell: process.platform === 'win32',
          stdio: ['ignore', 'pipe', 'pipe'],
        })

        const stderrChunks: string[] = []
        let killed = false

        const timer = setTimeout(() => {
          killed = true
          child.kill('SIGTERM')
        }, PNPM_TIMEOUT_MS)

        const onAbort = () => {
          killed = true
          child.kill('SIGTERM')
        }
        opts.abortSignal?.addEventListener('abort', onAbort, { once: true })

        child.stdout?.on('data', (chunk: Buffer) => {
          // pnpm prints package add progress here. We forward it as stderr-like
          // events so the UI can show "Progress: resolved N, added M".
          const text = chunk.toString('utf-8')
          for (const line of text.split('\n')) {
            const trimmed = line.trim()
            if (trimmed) opts.onEvent?.({ type: 'stderr', line: trimmed })
          }
        })

        child.stderr?.on('data', (chunk: Buffer) => {
          const text = chunk.toString('utf-8')
          stderrChunks.push(text)
          for (const line of text.split('\n')) {
            const trimmed = line.trim()
            if (trimmed) opts.onEvent?.({ type: 'stderr', line: trimmed })
          }
        })

        child.on('error', (err) => {
          clearTimeout(timer)
          opts.abortSignal?.removeEventListener('abort', onAbort)
          resolve({ code: null, stderr: stderrChunks.join(''), spawnError: err })
        })

        child.on('close', (code) => {
          clearTimeout(timer)
          opts.abortSignal?.removeEventListener('abort', onAbort)
          if (killed) {
            resolve({ code: code ?? -1, stderr: stderrChunks.join('') + '\n(killed)' })
          } else {
            resolve({ code, stderr: stderrChunks.join('') })
          }
        })
      }
    )

    if (result.spawnError) {
      const errCode = (result.spawnError as NodeJS.ErrnoException).code
      if (errCode === 'ENOENT') {
        // Executable missing — try next strategy.
        lastError = `${cmd} not found on PATH`
        continue
      }
      lastError = result.spawnError.message
      break
    }

    if (result.code === 0) {
      return { ok: true, installed: [], alreadySatisfied: [], skipped: 'none' }
    }
    lastError = result.stderr.slice(-2000) || `${cmd} exited with code ${result.code}`
    break
  }

  return {
    ok: false,
    error:
      lastError ??
      'pnpm not found. Run `corepack enable && corepack prepare pnpm@latest --activate`, then re-install the module.',
  }
}

/**
 * Find module source files that import any of the given packages and bump
 * their mtime. This is a best-effort attempt to nudge Turbopack's negative
 * resolution cache after the deps are installed.
 *
 * Returns the number of files touched.
 */
async function touchImporters(moduleDir: string, packageNames: string[]): Promise<number> {
  if (packageNames.length === 0) return 0
  const pkgRe = new RegExp(
    `from\\s+['"](?:${packageNames.map(escapeRegex).join('|')})(?:/[^'"]*)?['"]`,
    'm'
  )
  let touched = 0
  const now = new Date()

  async function walk(dir: string): Promise<void> {
    let entries: Dirent[]
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue
      const path = join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(path)
      } else if (entry.isFile() && /\.(tsx?|jsx?)$/.test(entry.name)) {
        try {
          const content = await readFile(path, 'utf-8')
          if (pkgRe.test(content)) {
            await utimes(path, now, now)
            touched++
          }
        } catch {
          // ignore unreadable files
        }
      }
    }
  }

  await walk(moduleDir)
  return touched
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
