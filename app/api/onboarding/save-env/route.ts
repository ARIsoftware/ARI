import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export const debugRole = "onboarding-save-env"
// Intentionally public — only effective during first-run setup before DATABASE_URL is configured
export const isPublic = true

/**
 * POST: Save .env.local file to project root
 * Used by the onboarding wizard to write the generated env file directly
 */
export async function POST(request: NextRequest) {
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
