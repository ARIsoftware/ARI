import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function POST(req: NextRequest) {
  try {
    const { user } = await getAuthenticatedUser()
    
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    }

    // Create Supabase client with service role key to bypass RLS
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    // Delete all existing records for the user
    const { error: deleteError } = await supabase
      .from('hyrox_station_records')
      .delete()
      .eq('user_id', user.id)

    if (deleteError) {
      console.error('Error deleting records:', deleteError)
      return NextResponse.json({ error: 'Failed to reset records' }, { status: 500 })
    }

    console.log(`Reset station records for user ${user.id}`)
    return NextResponse.json({ success: true, message: 'Station records reset successfully' })
  } catch (error) {
    console.error('API Error:', error)
    return NextResponse.json(
      { error: 'Failed to reset station records' },
      { status: 500 }
    )
  }
}