import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { checkRateLimit, getClientIp } from '@/lib/modules/public-route-security'
import { pool } from '@/lib/db/pool'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'

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

  // Guard: only allow if no users exist OR the caller is authenticated
  let hasUsers = false
  if (pool) {
    try {
      const result = await pool.query('SELECT EXISTS(SELECT 1 FROM public."user") AS has_users')
      hasUsers = result.rows[0]?.has_users === true
    } catch {
      // Table may not exist yet — that's fine, no users
    }
  }

  if (hasUsers) {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

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
  } catch (error: any) {
    console.error('[Save Env] Error:', error)
    return NextResponse.json(
      { error: 'Failed to save .env.local', details: error.message },
      { status: 500 }
    )
  }
}
