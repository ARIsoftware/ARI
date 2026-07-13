/**
 * Health Data - Upload API (chunked)
 *
 * Large request bodies are unreliable through Next's middleware body
 * replay (they arrive truncated), so the export zip is uploaded in small
 * sequential chunks — the same body-size class as every other ARI upload:
 *
 *   POST /api/modules/health-data/upload?action=begin
 *     → { upload_id }
 *   POST /api/modules/health-data/upload?action=chunk&id=…&index=n   (raw bytes)
 *     → { received }
 *   POST /api/modules/health-data/upload?action=finish&id=…
 *     → 202 { import }  — validates the zip, then parses in the background
 *
 * Upload sessions are held in module memory and their temp files are
 * cleaned up on failure, on finish, and by an age-based sweep.
 */

import { NextRequest, NextResponse, after } from 'next/server'
import { appendFile, writeFile, unlink, readFile, readdir, stat } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { eq } from 'drizzle-orm'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { createErrorResponse, validateQueryParams } from '@/lib/api-helpers'
import { healthDataImports } from '@/lib/db/schema'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse } from '@/lib/openapi/common'
import {
  uploadQuerySchema,
  UploadBodySchema,
  UploadResponseSchema,
  UploadBeginResponseSchema,
  UploadChunkResponseSchema,
} from '@/modules/health-data/lib/validation'
import { runImportJob } from '@/modules/health-data/lib/import-job'
import { RETENTION_MS, ensurePurgeSweeper } from '@/modules/health-data/lib/retention'
import { serializeImport } from '@/modules/health-data/lib/serialize'
import { findExportXml, readZipDirectory } from '@/modules/health-data/lib/zip-reader'

/** Apple Health export zips are usually under 200MB compressed. */
const MAX_UPLOAD_BYTES = 1024 * 1024 * 1024
/** Client sends 4MB slices; allow headroom for overhead. */
const MAX_CHUNK_BYTES = 8 * 1024 * 1024
/** Abandoned upload sessions are swept after this long. */
const SESSION_MAX_AGE_MS = 60 * 60 * 1000

interface UploadSession {
  userId: string
  path: string
  bytes: number
  nextIndex: number
  updatedAt: number
}

const uploadSessions = new Map<string, UploadSession>()

/**
 * Per-key promise-chain mutex. Chunk handling is check-then-append across
 * await points, so a client retry racing a still-running original (a proxy
 * can return 504 while the buffered request keeps executing) would pass the
 * same index check twice and append the chunk twice. All session mutations
 * are serialized per session id (and begins per user id) so the retry
 * re-reads state only after the original completes and lands in the
 * idempotent `index < nextIndex` branch. Entries self-remove once a key's
 * chain drains, so the map can't grow unbounded.
 */
const opLocks = new Map<string, Promise<unknown>>()

function withOpLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = opLocks.get(key) ?? Promise.resolve()
  const run = prev.catch(() => {}).then(fn)
  const tail = run.catch(() => {})
  opLocks.set(key, tail)
  void tail.then(() => {
    if (opLocks.get(key) === tail) opLocks.delete(key)
  })
  return run
}

/** Disk scan for orphans is cheap but not free — run it at most this often */
const DISK_SWEEP_INTERVAL_MS = 10 * 60 * 1000
let lastDiskSweep = 0

const zipPathFor = (uploadId: string) => join(tmpdir(), `ari-health-data-${uploadId}.zip`)
const metaPathFor = (zipPath: string) => `${zipPath}.meta.json`

/**
 * Sessions are mirrored to a .meta.json sidecar so an upload survives a
 * server restart or dev HMR reload: on a Map miss we rebuild the session
 * from disk (verifying owner and byte count).
 */
async function saveSessionMeta(session: UploadSession): Promise<void> {
  await writeFile(
    metaPathFor(session.path),
    JSON.stringify({ userId: session.userId, bytes: session.bytes, nextIndex: session.nextIndex })
  )
}

async function loadSessionFromDisk(uploadId: string, userId: string): Promise<UploadSession | null> {
  const path = zipPathFor(uploadId)
  try {
    const meta = JSON.parse(await readFile(metaPathFor(path), 'utf8')) as {
      userId?: string
      bytes?: number
      nextIndex?: number
    }
    if (meta.userId !== userId || typeof meta.bytes !== 'number' || typeof meta.nextIndex !== 'number') {
      return null
    }
    const size = (await stat(path)).size
    if (size !== meta.bytes) {
      // Crashed mid-append — the file can't be trusted, force a restart
      await unlink(path).catch(() => {})
      await unlink(metaPathFor(path)).catch(() => {})
      return null
    }
    const session: UploadSession = { userId, path, bytes: meta.bytes, nextIndex: meta.nextIndex, updatedAt: Date.now() }
    uploadSessions.set(uploadId, session)
    return session
  } catch {
    return null
  }
}

async function removeSessionFiles(session: UploadSession): Promise<void> {
  await unlink(session.path).catch(() => {})
  await unlink(metaPathFor(session.path)).catch(() => {})
}

async function sweepStaleSessions(): Promise<void> {
  const now = Date.now()
  const cutoff = now - SESSION_MAX_AGE_MS
  for (const [id, session] of uploadSessions) {
    if (session.updatedAt < cutoff) {
      // Removal runs under the session lock with staleness re-checked
      // inside it — an in-flight chunk holding the lock refreshes
      // updatedAt, so the sweep can't unlink the file mid-append.
      void withOpLock(`session:${id}`, async () => {
        const current = uploadSessions.get(id)
        if (!current || current.updatedAt >= cutoff) return
        uploadSessions.delete(id)
        await removeSessionFiles(current)
      })
    }
  }

  // Periodically also clear disk orphans (crashed processes, lost Maps).
  // The 1-hour age gate means in-flight uploads and parse jobs are never touched.
  if (now - lastDiskSweep < DISK_SWEEP_INTERVAL_MS) return
  lastDiskSweep = now
  try {
    for (const name of await readdir(tmpdir())) {
      if (!name.startsWith('ari-health-data-')) continue
      const full = join(tmpdir(), name)
      const info = await stat(full).catch(() => null)
      if (info && now - info.mtimeMs > SESSION_MAX_AGE_MS) {
        await unlink(full).catch(() => {})
      }
    }
  } catch {
    // Best-effort — tmpdir scan failures are not fatal
  }
}

registry.registerPath({
  method: 'post',
  path: '/api/modules/health-data/upload',
  operationId: 'uploadHealthDataExport',
  summary: 'Chunked upload of an Apple Health export zip (action=begin|chunk|finish); replaces any existing import',
  tags: ['health-data'],
  security: DEFAULT_SECURITY,
  request: {
    query: uploadQuerySchema,
    body: { content: { 'application/octet-stream': { schema: UploadBodySchema } } },
  },
  responses: {
    200: { description: 'Session started (begin) or chunk accepted (chunk)', content: { 'application/json': { schema: UploadBeginResponseSchema.or(UploadChunkResponseSchema) } } },
    202: { description: 'Import accepted and processing in the background (finish)', content: { 'application/json': { schema: UploadResponseSchema } } },
    400: { description: 'Validation error or corrupt upload', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    404: { description: 'Unknown upload session', content: { 'application/json': { schema: ErrorResponseSchema } } },
    413: { description: 'File too large', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const queryValidation = validateQueryParams(searchParams, uploadQuerySchema)
    if (!queryValidation.success) {
      return queryValidation.response
    }
    const { action, id, index } = queryValidation.data

    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return createErrorResponse('Unauthorized - Valid authentication required', 401)
    }

    ensurePurgeSweeper()
    await sweepStaleSessions()

    if (action === 'begin') {
      // begin drops the user's previous session, so two rapid begins must
      // not interleave their drop/create steps
      // awaited so a rejection inside the lock reaches the catch below
      return await withOpLock(`user:${user.id}`, () => beginUpload(user.id))
    }

    if (!id) {
      return createErrorResponse('Upload session id is required', 400)
    }
    // The session lookup happens inside the lock so a racing duplicate
    // observes the session only after the in-flight request has fully
    // completed (and its retry then hits the idempotent index branch).
    return await withOpLock(`session:${id}`, async () => {
      let session = uploadSessions.get(id) ?? null
      if (session && session.userId !== user.id) session = null
      if (!session) session = await loadSessionFromDisk(id, user.id)
      if (!session) {
        return createErrorResponse('Upload session not found — please restart the upload', 404)
      }

      if (action === 'chunk') {
        return appendChunk(request, id, session, index)
      }
      return finishUpload(id, session, user.id, withRLS)
    })
  } catch (error) {
    console.error('POST /api/modules/health-data/upload error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}

async function beginUpload(userId: string): Promise<NextResponse> {
  // One in-flight upload per user: drop any earlier session. The drop runs
  // under the old session's lock so it can't unlink the file under an
  // append that already passed its index check.
  for (const [existingId, session] of uploadSessions) {
    if (session.userId === userId) {
      void withOpLock(`session:${existingId}`, async () => {
        uploadSessions.delete(existingId)
        await removeSessionFiles(session)
      })
    }
  }

  const uploadId = randomUUID()
  const path = zipPathFor(uploadId)
  await writeFile(path, Buffer.alloc(0))
  const session: UploadSession = { userId, path, bytes: 0, nextIndex: 0, updatedAt: Date.now() }
  uploadSessions.set(uploadId, session)
  await saveSessionMeta(session)
  return NextResponse.json({ upload_id: uploadId })
}

async function appendChunk(
  request: NextRequest,
  id: string,
  session: UploadSession,
  index: number | undefined
): Promise<NextResponse> {
  if (index === undefined) {
    return createErrorResponse('Chunk index is required', 400)
  }
  // Retry of an already-applied chunk (its response was lost): idempotent success
  if (index < session.nextIndex) {
    return NextResponse.json({ received: session.bytes })
  }
  if (index > session.nextIndex) {
    return createErrorResponse(
      `Chunk arrived out of order (expected ${session.nextIndex}) — please restart the upload`,
      400
    )
  }

  // Proxies that re-frame the body as chunked transfer-encoding strip
  // Content-Length — when the header is absent, validate the actual bytes
  // after reading instead of rejecting the upload outright.
  const lengthHeader = request.headers.get('content-length')
  const declaredLength = lengthHeader === null ? null : Number(lengthHeader)
  if (
    declaredLength !== null &&
    (!Number.isFinite(declaredLength) || declaredLength <= 0 || declaredLength > MAX_CHUNK_BYTES)
  ) {
    // Nothing was appended — the client may retry this chunk
    return createErrorResponse('Invalid chunk size', 400)
  }
  if (declaredLength !== null && session.bytes + declaredLength > MAX_UPLOAD_BYTES) {
    return failSession(id, session, 'File is too large (1GB maximum)', 413)
  }

  const chunk = Buffer.from(await request.arrayBuffer())
  if (declaredLength !== null && chunk.length !== declaredLength) {
    // Transient transport truncation — nothing was appended, safe to retry
    console.error(`[health-data] Chunk ${index} truncated: received ${chunk.length} of ${declaredLength} bytes`)
    return createErrorResponse(
      `Chunk ${index} arrived incomplete (${chunk.length.toLocaleString()} of ${declaredLength.toLocaleString()} bytes) — retrying`,
      400
    )
  }
  // With a declared length these re-checks are tautological; without one
  // they are the only size validation.
  if (chunk.length === 0 || chunk.length > MAX_CHUNK_BYTES) {
    // Nothing was appended — the client may retry this chunk
    return createErrorResponse('Invalid chunk size', 400)
  }
  if (session.bytes + chunk.length > MAX_UPLOAD_BYTES) {
    return failSession(id, session, 'File is too large (1GB maximum)', 413)
  }

  await appendFile(session.path, chunk)
  session.bytes += chunk.length
  session.nextIndex += 1
  session.updatedAt = Date.now()
  await saveSessionMeta(session)
  return NextResponse.json({ received: session.bytes })
}

async function finishUpload(
  id: string,
  session: UploadSession,
  userId: string,
  withRLS: NonNullable<Awaited<ReturnType<typeof getAuthenticatedUser>>['withRLS']>
): Promise<NextResponse> {
  uploadSessions.delete(id)
  await unlink(metaPathFor(session.path)).catch(() => {})

  if (session.bytes < 100) {
    await unlink(session.path).catch(() => {})
    return createErrorResponse('The upload is empty — please try again', 400)
  }

  // Validate the archive before accepting it, so corruption fails
  // immediately with a clear message instead of via the background job.
  try {
    const { entries } = await readZipDirectory(session.path)
    if (findExportXml(entries) === null) {
      await unlink(session.path).catch(() => {})
      return createErrorResponse(
        'This zip does not contain an Apple Health export (export.xml not found). Export your data from the Health app and upload the resulting zip.',
        400
      )
    }
  } catch (zipError) {
    console.error(`[health-data] Uploaded zip failed validation after ${session.bytes} bytes:`, zipError)
    await unlink(session.path).catch(() => {})
    return createErrorResponse('The uploaded file is not a readable zip archive. Please re-export from the Health app and try again.', 400)
  }

  // Replace semantics: remove any previous import (cascade deletes all
  // parsed data; a still-running old job aborts on its next progress write).
  // The session is already gone from the Map, so if these DB calls fail the
  // temp file must be cleaned up here — nothing else can reach it.
  let importRow: typeof healthDataImports.$inferSelect
  try {
    await withRLS((db) => db.delete(healthDataImports).where(eq(healthDataImports.userId, userId)))

    const inserted = await withRLS((db) =>
      db
        .insert(healthDataImports)
        .values({
          userId,
          status: 'processing',
          progress: 1,
          phase: 'Starting import',
          expiresAt: new Date(Date.now() + RETENTION_MS).toISOString(),
        })
        .returning()
    )
    importRow = inserted[0]
  } catch (dbError) {
    await unlink(session.path).catch(() => {})
    throw dbError
  }

  const jobParams = { importId: importRow.id, userId, zipPath: session.path }
  after(() => runImportJob(jobParams))

  return NextResponse.json({ import: serializeImport(importRow) }, { status: 202 })
}

async function failSession(
  id: string,
  session: UploadSession,
  message: string,
  status: number
): Promise<NextResponse> {
  uploadSessions.delete(id)
  await removeSessionFiles(session)
  return createErrorResponse(message, status)
}
