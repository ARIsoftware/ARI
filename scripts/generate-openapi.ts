#!/usr/bin/env tsx
/**
 * Generate OpenAPI spec.
 *
 * Strategy: import every route module so its top-level `registry.registerPath`
 * side-effects fire, then ask the shared registry to build the document.
 *
 * Tolerates per-route import failures: a single broken handler must not block
 * spec generation for the rest. Failures are logged so they're visible in CI.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { MODULE_API_ROUTES } from '@/lib/generated/module-api-registry'
import { buildSpec } from '@/lib/openapi/build-spec'

const __filename = fileURLToPath(import.meta.url)
const REPO_ROOT = path.resolve(path.dirname(__filename), '..')
const OUTPUT_PATH = path.join(REPO_ROOT, 'lib', 'generated', 'openapi.json')
const APP_API_ROOT = path.join(REPO_ROOT, 'app', 'api')

const failures: { source: string; error: unknown }[] = []

async function importSafely(label: string, loader: () => Promise<unknown>) {
  try {
    await loader()
  } catch (err) {
    failures.push({ source: label, error: err })
  }
}

function collectModuleImports(): { label: string; loader: () => Promise<unknown> }[] {
  const out: { label: string; loader: () => Promise<unknown> }[] = []
  for (const [moduleId, routes] of Object.entries(MODULE_API_ROUTES)) {
    for (const [routePath, loader] of Object.entries(routes)) {
      out.push({ label: `module:${moduleId}/${routePath || '(root)'}`, loader })
    }
  }
  return out
}

async function findAppApiRouteFiles(dir: string): Promise<string[]> {
  const out: string[] = []
  let entries: import('node:fs').Dirent[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...(await findAppApiRouteFiles(full)))
    } else if (entry.isFile() && entry.name === 'route.ts') {
      out.push(full)
    }
  }
  return out
}

async function collectAppApiImports(): Promise<{ label: string; loader: () => Promise<unknown> }[]> {
  const files = await findAppApiRouteFiles(APP_API_ROOT)
  return files.flatMap((file) => {
    const rel = path.relative(REPO_ROOT, file).replace(/\\/g, '/')
    // The dispatcher's targets are imported via MODULE_API_ROUTES; skip it here.
    if (rel.includes('app/api/modules/[module]/[[...path]]/route.ts')) return []
    const aliasPath = '@/' + rel.replace(/\.ts$/, '')
    return [{ label: `app:${rel}`, loader: () => import(aliasPath) }]
  })
}

async function main() {
  const [moduleImports, appImports] = await Promise.all([
    Promise.resolve(collectModuleImports()),
    collectAppApiImports(),
  ])
  await Promise.all(
    [...moduleImports, ...appImports].map(({ label, loader }) => importSafely(label, loader))
  )

  const spec = buildSpec()

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true })
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(spec, null, 2) + '\n', 'utf8')

  const pathCount = Object.keys((spec.paths ?? {}) as Record<string, unknown>).length
  console.log(`[openapi] Wrote ${path.relative(REPO_ROOT, OUTPUT_PATH)} — ${pathCount} path(s).`)

  if (failures.length > 0) {
    console.warn(`[openapi] ${failures.length} route(s) failed to import:`)
    for (const f of failures) {
      const msg = f.error instanceof Error ? f.error.message : String(f.error)
      console.warn(`  - ${f.source}: ${msg}`)
    }
  }
}

main()
  .then(() => {
    // Force-exit because route imports may leave open handles (DB pool, etc.)
    // that would otherwise prevent Node from terminating.
    process.exit(0)
  })
  .catch((err) => {
    console.error('[openapi] Generation failed:', err)
    process.exit(1)
  })
