import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { getLicenseKey, MODULES_API_BASE, buildClientInfo } from '@/lib/license-helpers'
import { z } from 'zod'
import { writeFile, mkdir, rm } from 'fs/promises'
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

    // Save to temp file and extract to modules-core
    const tempPath = join(tmpdir(), `ari-module-${moduleName}-${Date.now()}.zip`)
    const targetDir = join(process.cwd(), 'modules-core', moduleName)

    try {
      await writeFile(tempPath, zipBuffer)
      await mkdir(targetDir, { recursive: true })
      await execAsync(`unzip -o "${tempPath}" -d "${targetDir}"`)
    } catch (extractError) {
      // Clean up partial extraction on failure
      await rm(targetDir, { recursive: true, force: true }).catch(() => {})
      await rm(tempPath, { force: true }).catch(() => {})
      console.error('[API /modules/download] Extract failed:', extractError)
      return NextResponse.json(
        { error: 'Failed to extract module package' },
        { status: 500 }
      )
    }

    // Clean up temp file
    await rm(tempPath, { force: true })

    return NextResponse.json({
      success: true,
      module: moduleName,
      version,
      installed_to: `modules-core/${moduleName}`,
    })
  } catch (error) {
    console.error('[API /modules/download] Error:', error)
    return NextResponse.json(
      { error: 'Failed to download and install module' },
      { status: 500 }
    )
  }
}
