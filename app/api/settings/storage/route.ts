import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { createErrorResponse, validateRequestBody } from '@/lib/api-helpers'
import { z } from 'zod'
import { existsSync } from 'fs'
import { resolve } from 'path'

const STORAGE_PATH = './data/storage/'

const providerSchema = z.object({
  provider: z.literal('local'),
})

export async function GET() {
  try {
    const { user } = await getAuthenticatedUser()
    if (!user) {
      return createErrorResponse('Unauthorized', 401)
    }

    const absolutePath = resolve(process.cwd(), STORAGE_PATH)
    const dirExists = existsSync(absolutePath)

    return NextResponse.json({
      provider: 'local',
      status: dirExists ? 'active' : 'not_configured',
      config: {
        path: STORAGE_PATH,
      },
    })
  } catch (error: unknown) {
    console.error('[Storage Settings GET]', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await getAuthenticatedUser()
    if (!user) {
      return createErrorResponse('Unauthorized', 401)
    }

    const validation = await validateRequestBody(request, providerSchema)
    if (!validation.success) {
      return validation.response
    }

    return NextResponse.json({
      success: true,
      provider: validation.data.provider,
    })
  } catch (error: unknown) {
    console.error('[Storage Settings POST]', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}
