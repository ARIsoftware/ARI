import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { MODULES_API_BASE, buildClientInfo } from '@/lib/license-helpers'
import { getLicenseKey } from '@/lib/license-helpers-server'
import { z } from 'zod'
import { writeFile, mkdir, rm, readFile, readdir, cp, stat } from 'fs/promises'
import { join, dirname, resolve, relative, isAbsolute, sep } from 'path'
import { getGitHubConfig, commitModuleToGitHub, type ExtraCommitFile } from '@/lib/modules/github-sync'
import { tmpdir } from 'os'
import { inflateRawSync } from 'zlib'
import { runSchemaSqlAtPath } from '@/lib/modules/schema-installer'
import { installModuleNpmDeps, type NpmInstallEvent, type NpmInstallResult } from '@/lib/modules/npm-installer'
import type { ModuleManifest } from '@/lib/modules/module-types'
import { downloadModuleSchema } from '@/lib/openapi/app-schemas'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema } from '@/lib/openapi/common'
import { TARGET_EXISTS_CODE, type ConflictType } from '@/lib/modules/install-types'

registry.registerPath({
  method: 'post',
  path: '/api/modules/download',
  operationId: 'downloadAndInstallModule',
  summary: 'Stream-install a module: download zip, extract, install npm deps, sync to GitHub (Vercel), run schema.sql',
  description: 'Streaming response — newline-delimited JSON (NDJSON) events for each install stage (extract → npm → github → schema → finalize). Content-Type: application/x-ndjson.',
  tags: ['app'],
  security: DEFAULT_SECURITY,
  request: { body: { content: { 'application/json': { schema: downloadModuleSchema } } } },
  responses: {
    200: { description: 'NDJSON stream of install events', content: { 'application/x-ndjson': { schema: { type: 'string' } } } },
    400: { description: 'Validation error', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    502: { description: 'Upstream module API returned an error', content: { 'application/json': { schema: ErrorResponseSchema } } },
  },
})

/**
 * Pure Node.js ZIP extractor using built-in zlib.
 * Uses the central directory (at end of file) for reliable metadata,
 * which correctly handles ZIPs with data descriptors (bit 3 flag).
 */
// Block ZIP entries that escape the extraction directory (Zip Slip).
function isUnsafeZipEntry(fileName: string): boolean {
  if (fileName === '' || isAbsolute(fileName)) return true
  if (/^[a-zA-Z]:[\\/]/.test(fileName)) return true // Windows drive letter
  return fileName.split(/[/\\]/).some(seg => seg === '..')
}

function isPathInside(child: string, parent: string): boolean {
  const resolvedChild = resolve(child)
  const resolvedParent = resolve(parent)
  if (resolvedChild === resolvedParent) return true
  const rel = relative(resolvedParent, resolvedChild)
  return !!rel && !rel.startsWith('..' + sep) && rel !== '..' && !isAbsolute(rel)
}

async function extractZip(zipBuffer: Buffer, targetDir: string): Promise<void> {
  const JUNK_PREFIXES = ['__MACOSX/', '__MACOSX']

  // Find End of Central Directory record by scanning backwards for signature 0x06054b50
  let eocdOffset = -1
  for (let i = zipBuffer.length - 22; i >= 0; i--) {
    if (zipBuffer.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i
      break
    }
  }
  if (eocdOffset === -1) {
    throw new Error('Invalid ZIP: End of Central Directory record not found')
  }

  const entryCount = zipBuffer.readUInt16LE(eocdOffset + 10)
  const cdOffset = zipBuffer.readUInt32LE(eocdOffset + 16)

  // Parse central directory entries
  let cdPos = cdOffset
  for (let i = 0; i < entryCount; i++) {
    if (zipBuffer.readUInt32LE(cdPos) !== 0x02014b50) {
      throw new Error(`Invalid ZIP: expected central directory entry at offset ${cdPos}`)
    }

    const compressionMethod = zipBuffer.readUInt16LE(cdPos + 10)
    const compressedSize = zipBuffer.readUInt32LE(cdPos + 20)
    const fileNameLen = zipBuffer.readUInt16LE(cdPos + 28)
    const extraLen = zipBuffer.readUInt16LE(cdPos + 30)
    const commentLen = zipBuffer.readUInt16LE(cdPos + 32)
    const localHeaderOffset = zipBuffer.readUInt32LE(cdPos + 42)
    const fileName = zipBuffer.toString('utf-8', cdPos + 46, cdPos + 46 + fileNameLen)

    // Advance to next central directory entry
    cdPos += 46 + fileNameLen + extraLen + commentLen

    // Skip junk entries
    if (JUNK_PREFIXES.some(p => fileName.startsWith(p)) || fileName === '.DS_Store' || fileName.includes('/.DS_Store')) {
      continue
    }

    // Reject Zip Slip: absolute paths, drive letters, or .. segments.
    if (isUnsafeZipEntry(fileName)) {
      throw new Error(`Unsafe ZIP entry rejected: ${fileName}`)
    }

    const filePath = join(targetDir, fileName)
    // Defense-in-depth: confirm the resolved path stays inside targetDir.
    if (!isPathInside(filePath, targetDir)) {
      throw new Error(`ZIP entry escapes target directory: ${fileName}`)
    }

    // Directory entry
    if (fileName.endsWith('/')) {
      await mkdir(filePath, { recursive: true })
      continue
    }

    // Calculate data start from local file header (extra field length can differ from central dir)
    const localFileNameLen = zipBuffer.readUInt16LE(localHeaderOffset + 26)
    const localExtraLen = zipBuffer.readUInt16LE(localHeaderOffset + 28)
    const dataStart = localHeaderOffset + 30 + localFileNameLen + localExtraLen

    // File entry
    await mkdir(dirname(filePath), { recursive: true })

    let data: Buffer
    if (compressionMethod === 0) {
      data = zipBuffer.subarray(dataStart, dataStart + compressedSize)
    } else if (compressionMethod === 8) {
      const compressed = zipBuffer.subarray(dataStart, dataStart + compressedSize)
      data = inflateRawSync(compressed)
    } else {
      console.warn(`[ZIP] Skipping ${fileName}: unsupported compression method ${compressionMethod}`)
      continue
    }

    await writeFile(filePath, data)
  }
}

function conflictResponse(type: ConflictType, moduleName: string): NextResponse {
  const message = type === 'custom_exists'
    ? `modules-custom/${moduleName} already exists`
    : `built-in modules-core/${moduleName} would be overridden`
  return NextResponse.json(
    {
      error: { code: TARGET_EXISTS_CODE, message },
      conflict: { type, moduleDir: `modules-custom/${moduleName}` },
    },
    { status: 409 }
  )
}

const DownloadSchema = z.object({
  module: z.string().regex(/^[a-z0-9-]{1,64}$/),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  force: z.boolean().optional(),
})

/**
 * Streamed install event. Emitted as newline-delimited JSON (NDJSON) so the
 * UI can show per-stage progress for installs that take 30s+ (pnpm download).
 *
 * Stages run in order: extract → npm → github → schema → finalize. A
 * `fatal` event ends the stream early on unrecoverable failure.
 */
export type InstallEvent =
  | { stage: 'extract'; status: 'start' | 'done' }
  | {
      stage: 'npm'
      status: 'start' | 'progress' | 'done' | 'skipped' | 'error'
      packages?: string[]
      detail?: string
      error?: string
      conflict?: { name: string; declared: string; existing: string }
    }
  | {
      stage: 'github'
      status: 'start' | 'done' | 'skipped' | 'error'
      commitSha?: string
      filesCommitted?: number
      error?: string
    }
  | {
      stage: 'schema'
      status: 'start' | 'done' | 'skipped' | 'error'
      alreadyExisted?: boolean
      error?: string
    }
  | {
      stage: 'finalize'
      status: 'done'
      module: string
      version: string
      moduleDir: string
      installed_to: string
      vercel: boolean
      firstRoute?: string
    }
  | { stage: 'fatal'; error: string; code?: string }

export async function POST(request: NextRequest) {
  // ─────────────────────────────────────────────────────────────────────
  // Pre-stream phase: anything that could legitimately return a non-200
  // status (auth, validation, upstream API errors) runs here. Once we
  // start streaming, all errors become fatal events with HTTP 200.
  // ─────────────────────────────────────────────────────────────────────

  const { user } = await getAuthenticatedUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parseResult = DownloadSchema.safeParse(body)
  if (!parseResult.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parseResult.error.flatten() },
      { status: 400 }
    )
  }

  const { module: moduleName, version, force } = parseResult.data

  // Conflict gate: if the install target already exists on disk, return 409
  // and let the client confirm before we hit the upstream API or touch files.
  // Skipped on Vercel because the deployed bundle's modules-custom/ entries
  // come from prior GitHub commits — a fresh re-install can't be reliably
  // distinguished from a redeploy and the GitHub-sync flow already gates
  // persistence there.
  if (!force && !process.env.VERCEL) {
    const customPath = join(process.cwd(), 'modules-custom', moduleName)
    if (await stat(customPath).then(() => true).catch(() => false)) {
      return conflictResponse('custom_exists', moduleName)
    }
    const corePath = join(process.cwd(), 'modules-core', moduleName)
    if (await stat(corePath).then(() => true).catch(() => false)) {
      return conflictResponse('core_override', moduleName)
    }
  }

  const licenseKey = await getLicenseKey(user.id)

  const downloadBody: { module: string; version: string; client_info: ReturnType<typeof buildClientInfo>; license_key?: string } = {
    module: moduleName,
    version,
    client_info: buildClientInfo(),
  }
  if (licenseKey) downloadBody.license_key = licenseKey

  const apiResponse = await fetch(`${MODULES_API_BASE}/modules/download`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(downloadBody),
  })

  if (!apiResponse.ok) {
    const errorData = await apiResponse.json().catch(() => ({}))
    const upstreamError = errorData.error
    const errorPayload = upstreamError?.code
      ? { code: upstreamError.code, message: upstreamError.message ?? 'Failed to get download URL' }
      : { message: upstreamError?.message ?? 'Failed to get download URL' }
    return NextResponse.json({ error: errorPayload }, { status: apiResponse.status })
  }

  const apiData = await apiResponse.json()
  const { download_url } = apiData
  if (!download_url) {
    console.error('[API /modules/download] No download_url in API response:', JSON.stringify(apiData))
    return NextResponse.json({ error: 'Module API did not return a download URL' }, { status: 502 })
  }

  const zipResponse = await fetch(download_url)
  if (!zipResponse.ok) {
    console.error(`[API /modules/download] ZIP fetch failed: ${zipResponse.status} ${zipResponse.statusText} from ${download_url}`)
    return NextResponse.json(
      { error: `Failed to download module package (${zipResponse.status})` },
      { status: 502 }
    )
  }

  const zipBuffer = Buffer.from(await zipResponse.arrayBuffer())

  // ─────────────────────────────────────────────────────────────────────
  // Stream phase: all subsequent progress and errors are emitted as
  // newline-delimited JSON events.
  // ─────────────────────────────────────────────────────────────────────

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: InstallEvent) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'))
        } catch {
          // controller already closed; nothing to do
        }
      }

      const aborted = () => request.signal.aborted

      // ── 1. Extract ────────────────────────────────────────────────
      emit({ stage: 'extract', status: 'start' })

      const isVercel = !!process.env.VERCEL
      const tempExtractDir = join(tmpdir(), `ari-module-extract-${moduleName}-${Date.now()}`)
      const targetDir = isVercel
        ? join(tmpdir(), 'ari-modules', moduleName)
        : join(process.cwd(), 'modules-custom', moduleName)

      try {
        await mkdir(tempExtractDir, { recursive: true })
        await extractZip(zipBuffer, tempExtractDir)

        const extractedEntries = await readdir(tempExtractDir, { withFileTypes: true })
        const dirs = extractedEntries.filter((e) => e.isDirectory())
        const files = extractedEntries.filter((e) => e.isFile())
        const sourceDir =
          dirs.length === 1 && files.length === 0
            ? join(tempExtractDir, dirs[0].name)
            : tempExtractDir

        await rm(targetDir, { recursive: true, force: true })
        await mkdir(targetDir, { recursive: true })
        const sourceEntries = await readdir(sourceDir)
        await Promise.all(
          sourceEntries.map((entry) =>
            cp(join(sourceDir, entry), join(targetDir, entry), { recursive: true })
          )
        )
      } catch (extractError) {
        await rm(targetDir, { recursive: true, force: true }).catch(() => {})
        await rm(tempExtractDir, { recursive: true, force: true }).catch(() => {})
        console.error('[API /modules/download] Extract failed:', extractError)
        emit({ stage: 'fatal', error: 'Failed to extract module package' })
        controller.close()
        return
      }
      await rm(tempExtractDir, { recursive: true, force: true }).catch(() => {})

      emit({ stage: 'extract', status: 'done' })
      if (aborted()) {
        emit({ stage: 'fatal', error: 'aborted' })
        controller.close()
        return
      }

      // ── Read the freshly-extracted manifest ───────────────────────
      let manifest: ModuleManifest | null = null
      try {
        const manifestText = await readFile(join(targetDir, 'module.json'), 'utf-8')
        manifest = JSON.parse(manifestText) as ModuleManifest
      } catch (err) {
        console.warn('[API /modules/download] Could not read extracted module.json:', err)
        // Proceed without a manifest — module may still be valid for downstream
        // steps (schema install is path-driven, not manifest-driven).
      }

      // ── 2. npm dependencies ──────────────────────────────────────
      let mutatedPackageJson: string | undefined
      const npmDeps = manifest?.npmDependencies
      if (npmDeps && Object.keys(npmDeps).length > 0) {
        emit({ stage: 'npm', status: 'start', packages: Object.entries(npmDeps).map(([n, v]) => `${n}@${v}`) })

        const ghConfig = isVercel ? getGitHubConfig() : null

        const npmResult: NpmInstallResult = await installModuleNpmDeps(moduleName, npmDeps, targetDir, {
          isVercel,
          githubConfigured: isVercel ? !!ghConfig : undefined,
          abortSignal: request.signal,
          onEvent: (e: NpmInstallEvent) => {
            // Forward installer events as `progress` so the UI gets live output.
            if (e.type === 'stderr' || e.type === 'spawn' || e.type === 'cache-bust' || e.type === 'already-satisfied') {
              emit({
                stage: 'npm',
                status: 'progress',
                detail:
                  e.type === 'stderr' ? e.line :
                  e.type === 'spawn' ? e.command :
                  e.type === 'cache-bust' ? `cache-bust: touched ${e.touched} file(s)` :
                  `already-satisfied: ${e.packages.join(', ')}`,
              })
            }
          },
        })

        if (!npmResult.ok) {
          emit({
            stage: 'npm',
            status: 'error',
            error: npmResult.error,
            ...(npmResult.conflict ? { conflict: npmResult.conflict } : {}),
          })
          emit({ stage: 'fatal', error: npmResult.error })
          controller.close()
          return
        }

        if (npmResult.skipped === 'vercel') {
          mutatedPackageJson = npmResult.mutatedPackageJson
          emit({ stage: 'npm', status: 'skipped', detail: 'Vercel — package.json will be committed to GitHub' })
        } else if (npmResult.skipped === 'empty' || (npmResult.installed.length === 0 && npmResult.alreadySatisfied.length === Object.keys(npmDeps).length)) {
          emit({ stage: 'npm', status: 'done', detail: 'all dependencies already satisfied' })
        } else {
          emit({ stage: 'npm', status: 'done', packages: npmResult.installed })
        }
      } else {
        emit({ stage: 'npm', status: 'skipped', detail: 'no declared dependencies' })
      }
      if (aborted()) {
        emit({ stage: 'fatal', error: 'aborted' })
        controller.close()
        return
      }

      // ── 3. GitHub sync (Vercel only) ──────────────────────────────
      if (isVercel) {
        const ghConfig = getGitHubConfig()
        if (ghConfig) {
          emit({ stage: 'github', status: 'start' })
          try {
            const extraFiles: ExtraCommitFile[] = mutatedPackageJson
              ? [{ repoPath: 'package.json', content: mutatedPackageJson, encoding: 'utf-8' }]
              : []
            const result = await commitModuleToGitHub(moduleName, targetDir, ghConfig, extraFiles)
            emit({
              stage: 'github',
              status: 'done',
              commitSha: result.commitSha,
              filesCommitted: result.filesCommitted,
            })
          } catch (err: unknown) {
            console.error('[API /modules/download] GitHub sync failed:', err)
            emit({
              stage: 'github',
              status: 'error',
              error: err instanceof Error ? err.message : String(err),
            })
            // GitHub sync failure on Vercel is fatal: without it, the
            // freshly-installed module disappears on the next deploy.
            emit({ stage: 'fatal', error: 'GitHub sync failed; module will not persist past next deploy' })
            controller.close()
            return
          }
        } else {
          emit({ stage: 'github', status: 'skipped', error: 'GitHub not configured' })
        }
      } else {
        emit({ stage: 'github', status: 'skipped' })
      }
      if (aborted()) {
        emit({ stage: 'fatal', error: 'aborted' })
        controller.close()
        return
      }

      // ── 4. Schema install ────────────────────────────────────────
      emit({ stage: 'schema', status: 'start' })
      const schemaInstall = await runSchemaSqlAtPath(
        moduleName,
        join(targetDir, 'database', 'schema.sql')
      )
      if (schemaInstall.ok) {
        emit({ stage: 'schema', status: 'done' })
      } else if (schemaInstall.alreadyExisted) {
        // Tables already exist — treat as success for UI purposes.
        emit({ stage: 'schema', status: 'done', alreadyExisted: true })
      } else {
        // Schema failure is non-fatal: module files are installed and the
        // user can re-run via Settings → Backup or by re-enabling the module.
        emit({ stage: 'schema', status: 'error', error: schemaInstall.error })
      }

      // ── 5. Finalize ──────────────────────────────────────────────
      const firstRoute = manifest?.routes?.[0]?.path
      emit({
        stage: 'finalize',
        status: 'done',
        module: moduleName,
        version,
        moduleDir: targetDir,
        installed_to: isVercel ? targetDir : `modules-custom/${moduleName}`,
        vercel: isVercel,
        ...(firstRoute ? { firstRoute } : {}),
      })

      controller.close()
    },
    cancel() {
      // Client disconnected. installModuleNpmDeps observes request.signal
      // and kills the pnpm child process.
    },
  })

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Accel-Buffering': 'no', // hint to disable proxy buffering (e.g. nginx)
    },
  })
}
