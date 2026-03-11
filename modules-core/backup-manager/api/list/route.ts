import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { createClient } from '@supabase/supabase-js'
import { logger } from '@/lib/logger'

// Create service role client
function getServiceSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY

  if (!supabaseUrl || !supabaseSecretKey) {
    throw new Error('Missing Supabase environment variables')
  }

  return createClient(supabaseUrl, supabaseSecretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

// Default pagination values
const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100

export async function GET(request: NextRequest) {
  try {
    const { user } = await getAuthenticatedUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse pagination parameters
    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, parseInt(searchParams.get('limit') || String(DEFAULT_LIMIT), 10))
    )
    const offset = (page - 1) * limit

    logger.info(`[Backup List] User ${user.id} fetching backups (page=${page}, limit=${limit})`)

    const supabase = getServiceSupabase()

    // Fetch backups with pagination
    const { data: backups, error, count } = await supabase
      .from('backup_metadata')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      // Table might not exist yet
      if (error.code === '42P01') {
        logger.info('[Backup List] backup_metadata table does not exist yet')
        return NextResponse.json({
          backups: [],
          total: 0,
          page,
          limit,
          totalPages: 0,
        })
      }
      logger.error(`[Backup List] Database error: ${error.message}`)
      throw error
    }

    const total = count || 0
    const totalPages = Math.ceil(total / limit)

    logger.info(`[Backup List] Found ${backups?.length || 0} backups (total: ${total})`)

    return NextResponse.json({
      backups: backups || [],
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to list backups'
    logger.error(`[Backup List] Error: ${errorMessage}`)
    return NextResponse.json(
      { error: 'Failed to list backups' },
      { status: 500 }
    )
  }
}
