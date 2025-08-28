import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'

export async function GET(request: NextRequest) {
  try {
    const { user, supabase } = await getAuthenticatedUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { data, error } = await supabase
      .from('ari-database')
      .select('title, updated_at')
      .eq('completed', true)
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