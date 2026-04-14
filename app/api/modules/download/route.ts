import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { MODULES_API_BASE, buildClientInfo } from '@/lib/license-helpers'
import { getLicenseKey } from '@/lib/license-helpers-server'
import { z } from 'zod'
import { writeFile, mkdir, rm, readdir, cp, readFile } from 'fs/promises'
import { join, dirname } from 'path'
import { getGitHubConfig, commitModuleToGitHub } from '@/lib/modules/github-sync'
import { tmpdir } from 'os'
import { inflateRawSync } from 'zlib'

/**
 * Pure Node.js ZIP extractor using built-in zlib.
 * Uses the central directory (at end of file) for reliable metadata,
 * which correctly handles ZIPs with data descriptors (bit 3 flag).
 */
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

    const filePath = join(targetDir, fileName)

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

const DownloadSchema = z.object({
  module: z.string().regex(/^[a-z0-9-]{1,64}$/),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
})

export async function POST(request: NextRequest) {
  const { user } = await getAuthenticatedUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const parseResult = DownloadSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parseResult.error.flatten() },
        { status: 400 }
      )
    }

    const { module: moduleName, version } = parseResult.data
    const licenseKey = await getLicenseKey(user.id)

    // Get presigned download URL from external API
    const downloadBody: { module: string; version: string; client_info: ReturnType<typeof buildClientInfo>; license_key?: string } = {
      module: moduleName,
      version,
      client_info: buildClientInfo(),
    }

    if (licenseKey) {
      downloadBody.license_key = licenseKey
    }

    const apiResponse = await fetch(`${MODULES_API_BASE}/modules/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(downloadBody),
    })

    if (!apiResponse.ok) {
      const errorData = await apiResponse.json().catch(() => ({}))
      return NextResponse.json(
        { error: errorData.error?.message || 'Failed to get download URL' },
        { status: apiResponse.status }
      )
    }

    const { download_url } = await apiResponse.json()

    // Download the zip file
    const zipResponse = await fetch(download_url)
    if (!zipResponse.ok) {
      return NextResponse.json(
        { error: 'Failed to download module package' },
        { status: 500 }
      )
    }

    const zipBuffer = Buffer.from(await zipResponse.arrayBuffer())

    // Save to temp file and extract
    const isVercel = !!process.env.VERCEL
    const tempExtractDir = join(tmpdir(), `ari-module-extract-${moduleName}-${Date.now()}`)
    const targetDir = isVercel
      ? join(tmpdir(), 'ari-modules', moduleName)
      : join(process.cwd(), 'modules-core', moduleName)

    try {
      await mkdir(tempExtractDir, { recursive: true })

      // Extract zip using pure Node.js (no CLI dependency)
      await extractZip(zipBuffer, tempExtractDir)

      // Check if the zip contained a single top-level directory (e.g., baseball/baseball/)
      const extractedEntries = (await readdir(tempExtractDir, { withFileTypes: true }))
      const dirs = extractedEntries.filter(e => e.isDirectory())
      const files = extractedEntries.filter(e => e.isFile())

      let sourceDir: string

      if (dirs.length === 1 && files.length === 0) {
        // Single top-level directory — use its contents to avoid nesting
        sourceDir = join(tempExtractDir, dirs[0].name)
      } else {
        // Contents are already flat — use the extract dir directly
        sourceDir = tempExtractDir
      }

      // Move contents to the target directory
      await rm(targetDir, { recursive: true, force: true })
      await mkdir(targetDir, { recursive: true })

      const sourceEntries = await readdir(sourceDir)
      await Promise.all(sourceEntries.map(entry =>
        cp(join(sourceDir, entry), join(targetDir, entry), { recursive: true })
      ))
    } catch (extractError) {
      // Clean up partial extraction on failure
      await rm(targetDir, { recursive: true, force: true }).catch(() => {})
      await rm(tempExtractDir, { recursive: true, force: true }).catch(() => {})
      console.error('[API /modules/download] Extract failed:', extractError)
      return NextResponse.json(
        { error: 'Failed to extract module package' },
        { status: 500 }
      )
    }

    // Clean up temp files
    await rm(tempExtractDir, { recursive: true, force: true }).catch(() => {})

    // On Vercel, auto-sync to GitHub in the same request (targetDir still exists)
    let githubSync = null
    if (isVercel) {
      const ghConfig = getGitHubConfig()
      if (ghConfig) {
        try {
          const result = await commitModuleToGitHub(moduleName, targetDir, ghConfig)
          githubSync = {
            success: true,
            commitSha: result.commitSha,
            filesCommitted: result.filesCommitted,
            message: result.message,
          }
        } catch (err: any) {
          console.error('[API /modules/download] GitHub sync failed:', err)
          githubSync = { success: false, error: err.message }
        }
      }
    }

    // Collect SQL migration files from the module's database/ directory
    let sqlMigrations: Array<{ name: string; sql: string }> | null = null
    try {
      const dbDir = join(targetDir, 'database')
      const dbEntries = await readdir(dbDir, { withFileTypes: true }).catch(() => null)

      if (dbEntries) {
        const migrations: Array<{ name: string; sql: string }> = []
        const addedNames = new Set<string>()

        // Read schema.sql first (if present)
        try {
          const sql = await readFile(join(dbDir, 'schema.sql'), 'utf-8')
          migrations.push({ name: 'schema', sql })
          addedNames.add('schema')
        } catch { /* no schema.sql — fine */ }

        // Read migrations/ subdirectory (if present)
        const hasMigrationsDir = dbEntries.some(e => e.name === 'migrations' && e.isDirectory())
        if (hasMigrationsDir) {
          const migrationsDir = join(dbDir, 'migrations')
          const migrationFiles = (await readdir(migrationsDir)).filter(f => f.endsWith('.sql')).sort()
          const results = await Promise.all(
            migrationFiles.map(file =>
              readFile(join(migrationsDir, file), 'utf-8').then(sql => ({ name: file.replace(/\.sql$/, ''), sql }))
            )
          )
          for (const m of results) {
            migrations.push(m)
            addedNames.add(m.name)
          }
        }

        // Read loose .sql files in database/ (excluding schema.sql, sample-data.sql)
        const looseSqlFiles = dbEntries
          .filter(e => e.isFile() && e.name.endsWith('.sql') && e.name !== 'schema.sql' && e.name !== 'sample-data.sql')
          .map(e => e.name)
          .sort()
        if (looseSqlFiles.length > 0) {
          const results = await Promise.all(
            looseSqlFiles
              .filter(file => !addedNames.has(file.replace(/\.sql$/, '')))
              .map(file =>
                readFile(join(dbDir, file), 'utf-8').then(sql => ({ name: file.replace(/\.sql$/, ''), sql }))
              )
          )
          migrations.push(...results)
        }

        if (migrations.length > 0) {
          sqlMigrations = migrations
        }
      }
    } catch (err) {
      console.warn('[API /modules/download] Failed to collect SQL migrations:', err)
    }

    return NextResponse.json({
      success: true,
      module: moduleName,
      version,
      installed_to: isVercel ? targetDir : `modules-core/${moduleName}`,
      moduleDir: targetDir,
      vercel: isVercel,
      githubSync,
      sqlMigrations,
    })
  } catch (error) {
    console.error('[API /modules/download] Error:', error)
    return NextResponse.json(
      { error: 'Failed to download and install module' },
      { status: 500 }
    )
  }
}
