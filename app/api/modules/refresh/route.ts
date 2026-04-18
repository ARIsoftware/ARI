import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function POST() {
  if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'Registry refresh is not available in production. Redeploy to update module registries.' },
      { status: 403 }
    )
  }

  // Auth check - same lightweight cookie check as the module API route
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get('better-auth.session_token')
    || cookieStore.get('__Secure-better-auth.session_token')
  if (!sessionCookie) {
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
    console.error('[Module Refresh] Error:', error)
    return NextResponse.json(
      { error: 'Failed to regenerate module registries', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
