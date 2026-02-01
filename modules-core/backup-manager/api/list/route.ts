import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { createClient } from '@supabase/supabase-js'
import { desc } from 'drizzle-orm'

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

export async function GET() {
  try {
    const { user } = await getAuthenticatedUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServiceSupabase()

    // Fetch backups from backup_metadata table
    const { data: backups, error } = await supabase
      .from('backup_metadata')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      // Table might not exist yet
      if (error.code === '42P01') {
        return NextResponse.json({ backups: [], total: 0 })
      }
      throw error
    }

    return NextResponse.json({
      backups: backups || [],
      total: backups?.length || 0,
    })
  } catch (error) {
    console.error('Failed to list backups:', error)
    return NextResponse.json(
      { error: 'Failed to list backups' },
      { status: 500 }
    )
  }
}
