import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { checkRateLimit, getClientIp } from '@/lib/modules/public-route-security'
import { requireAuthIfUsersExist } from '@/lib/auth-helpers'

export const debugRole = "onboarding-save-env"
// Public during setup — guarded below by user-count check
export const isPublic = true

export async function POST(request: NextRequest) {
  if (!checkRateLimit(`save-env:${getClientIp(request)}`, 3)) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please try again later.' },
      { status: 429 }
    )
  }

  const origin = request.headers.get("origin")
  const referer = request.headers.get("referer")
  if (!origin && !referer) {
    return NextResponse.json(
      { error: 'Missing origin header' },
      { status: 400 }
    )
  }

  const denied = await requireAuthIfUsersExist(request.headers)
  if (denied) return denied

  try {
    const { content } = await request.json()
    if (!content || typeof content !== 'string') {
      return NextResponse.json({ error: 'content is required' }, { status: 400 })
    }

    const envPath = path.join(process.cwd(), '.env.local')

    // Back up existing file before overwriting
    if (fs.existsSync(envPath)) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const backupPath = path.join(process.cwd(), `.env.local.${timestamp}`)
      fs.renameSync(envPath, backupPath)
    }

    fs.writeFileSync(envPath, content, 'utf-8')

    return NextResponse.json({ success: true, path: envPath })
  } catch (error: unknown) {
    console.error('[Save Env] Error:', error)
    return NextResponse.json(
      { error: 'Failed to save .env.local', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
