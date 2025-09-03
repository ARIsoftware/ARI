import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { logger } from '@/lib/logger'
import { createErrorResponse } from '@/lib/api-helpers'

export async function POST(req: NextRequest) {
  try {
    const { user, supabase } = await getAuthenticatedUser()
    
    if (!user) {
      return createErrorResponse("Authentication required", 401)
    }

    // Use user-scoped client with RLS - explicitly filter by user_id for security
    const { error: deleteError } = await supabase
      .from('hyrox_station_records')
      .delete()
      .eq('user_id', user.id)  // CRITICAL: Explicit user filtering

    if (deleteError) {
      console.error('Error deleting records:', deleteError)
      return createErrorResponse('Failed to reset records', 500)
    }

    logger.info(`Reset station records for user ${user.id}`)
    return NextResponse.json({ success: true, message: 'Station records reset successfully' })
  } catch (error) {
    logger.error('API Error:', error)
    return createErrorResponse('Failed to reset station records', 500)
  }
}