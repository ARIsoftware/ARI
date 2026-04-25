import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { logger } from '@/lib/logger'
import { safeErrorResponse } from '@/lib/api-error'

export async function POST() {
  if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'Registry refresh is not available in production. Redeploy to update module registries.' },
      { status: 403 }
    )
  }

  const { user } = await getAuthenticatedUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { exec } = await import('child_process')
    const { promisify } = await import('util')
    const execAsync = promisify(exec)
    const { stdout, stderr } = await execAsync(
      'node scripts/generate-module-registry.js',
      { cwd: process.cwd(), timeout: 30000 }
    )

    return NextResponse.json({
      success: true,
      message: 'Module registries regenerated successfully',
      output: stdout,
      ...(stderr ? { warnings: stderr } : {}),
    })
  } catch (error: unknown) {
    logger.error('[Module Refresh] Error:', error)
    return NextResponse.json(
      { error: safeErrorResponse(error) },
      { status: 500 }
    )
  }
}
