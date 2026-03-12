import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { getLicenseKey, MODULES_API_BASE, buildClientInfo } from '@/lib/license-helpers'
import { z } from 'zod'
import { writeFile, mkdir, rm, readdir, cp } from 'fs/promises'
import { join } from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import { tmpdir } from 'os'

const execAsync = promisify(exec)

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
    const tempPath = join(tmpdir(), `ari-module-${moduleName}-${Date.now()}.zip`)
    const tempExtractDir = join(tmpdir(), `ari-module-extract-${moduleName}-${Date.now()}`)
    const targetDir = isVercel
      ? join(tmpdir(), 'ari-modules', moduleName)
      : join(process.cwd(), 'modules-core', moduleName)

    try {
      await writeFile(tempPath, zipBuffer)
      await mkdir(tempExtractDir, { recursive: true })

      // Extract to temp directory first to handle nested directory structure
      await execAsync(`unzip -o "${tempPath}" -d "${tempExtractDir}"`)

      // Check if the zip contained a single top-level directory (e.g., baseball/baseball/)
      // Filter out macOS/zip artifacts that shouldn't affect the detection
      const JUNK_ENTRIES = new Set(['__MACOSX', '.DS_Store'])
      const extractedEntries = (await readdir(tempExtractDir, { withFileTypes: true }))
        .filter(e => !JUNK_ENTRIES.has(e.name))
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

      // Clean up junk from the source before copying
      for (const junk of JUNK_ENTRIES) {
        await rm(join(tempExtractDir, junk), { recursive: true, force: true }).catch(() => {})
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
      await rm(tempPath, { force: true }).catch(() => {})
      await rm(tempExtractDir, { recursive: true, force: true }).catch(() => {})
      console.error('[API /modules/download] Extract failed:', extractError)
      return NextResponse.json(
        { error: 'Failed to extract module package' },
        { status: 500 }
      )
    }

    // Clean up temp files
    await rm(tempPath, { force: true }).catch(() => {})
    await rm(tempExtractDir, { recursive: true, force: true }).catch(() => {})

    return NextResponse.json({
      success: true,
      module: moduleName,
      version,
      installed_to: isVercel ? targetDir : `modules-core/${moduleName}`,
      moduleDir: targetDir,
      vercel: isVercel,
    })
  } catch (error) {
    console.error('[API /modules/download] Error:', error)
    return NextResponse.json(
      { error: 'Failed to download and install module' },
      { status: 500 }
    )
  }
}
