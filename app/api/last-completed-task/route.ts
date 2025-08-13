import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY!

const supabase = createClient(supabaseUrl, supabaseSecretKey)

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    
    let query = supabase
      .from('ari-database')
      .select('title, updated_at')
      .eq('completed', true)
    
    // Add user_id filter if provided
    if (userId) {
      query = query.eq('user_id', userId)
    }
    
    const { data, error } = await query
      .order('updated_at', { ascending: false })
      .limit(1)
      .single()

    if (error) {
      // Don't log error if no rows found (this is normal)
      if (error.code !== 'PGRST116') {
        console.error('Error fetching last completed task:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      return NextResponse.json(null)
    }

    return NextResponse.json(data)
  } catch (err) {
    console.error('API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}