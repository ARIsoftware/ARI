import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { logger } from '@/lib/logger'
import { createErrorResponse } from '@/lib/api-helpers'
import { hyroxStationRecords } from '@/lib/db/schema'

export async function POST(req: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return createErrorResponse("Authentication required", 401)
    }

    // RLS automatically ensures user can only delete their own records
    await withRLS((db) =>
      db.delete(hyroxStationRecords)
    )

    logger.info(`Reset station records for user ${user.id}`)
    return NextResponse.json({ success: true, message: 'Station records reset successfully' })
  } catch (error) {
    logger.error('API Error:', error)
    return createErrorResponse('Failed to reset station records', 500)
  }
}
