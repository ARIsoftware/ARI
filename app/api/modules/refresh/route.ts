import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export async function POST() {
  // Auth check - same lightweight cookie check as the module API route
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get('better-auth.session_token')
    || cookieStore.get('__Secure-better-auth.session_token')
  if (!sessionCookie) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
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
  } catch (error: any) {
    console.error('[Module Refresh] Error:', error)
    return NextResponse.json(
      { error: 'Failed to regenerate module registries', details: error.message },
      { status: 500 }
    )
  }
}
