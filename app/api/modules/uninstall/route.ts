import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { z } from 'zod'
import { rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { getGitHubConfig, deleteModuleFromGitHub } from '@/lib/modules/github-sync'
import { CORE_MODULE_IDS } from '@/lib/modules/constants'

const UninstallSchema = z.object({
  moduleId: z.string().regex(/^[a-z0-9-]{1,64}$/),
})

export async function POST(request: NextRequest) {
  const { user } = await getAuthenticatedUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const parseResult = UninstallSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parseResult.error.flatten() },
        { status: 400 }
      )
    }

    const { moduleId } = parseResult.data

    if (CORE_MODULE_IDS.includes(moduleId)) {
      return NextResponse.json(
        { error: 'Core modules cannot be uninstalled' },
        { status: 403 }
      )
    }

    const isVercel = !!process.env.VERCEL

    // On Vercel, GitHub sync is required to persist the deletion
    let githubSync = null
    if (isVercel) {
      const ghConfig = getGitHubConfig()
      if (ghConfig) {
        try {
          const result = await deleteModuleFromGitHub(moduleId, ghConfig)
          githubSync = {
            success: true,
            commitSha: result.commitSha,
            filesDeleted: result.filesDeleted,
            message: result.message,
          }
        } catch (err: any) {
          console.error('[API /modules/uninstall] GitHub sync failed:', err)
          githubSync = { success: false, error: err.message }
        }
      }
    }

    // Delete local directory (and tmp on Vercel) in parallel
    const localDir = join(process.cwd(), 'modules-core', moduleId)
    const deletions: Promise<void>[] = [rm(localDir, { recursive: true, force: true })]
    if (isVercel) {
      deletions.push(rm(join(tmpdir(), 'ari-modules', moduleId), { recursive: true, force: true }).catch(() => {}))
    }
    await Promise.all(deletions)

    return NextResponse.json({
      success: true,
      moduleId,
      vercel: isVercel,
      githubSync,
    })
  } catch (error) {
    console.error('[API /modules/uninstall] Error:', error)
    return NextResponse.json(
      { error: 'Failed to uninstall module' },
      { status: 500 }
    )
  }
}
