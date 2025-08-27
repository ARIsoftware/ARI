import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedSupabaseClient } from '@/lib/supabase-auth-api'

export async function GET(request: NextRequest) {
  try {
    const { supabase, userId } = await createAuthenticatedSupabaseClient()
    console.log('✅ User authenticated:', userId)

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
    
    if (err instanceof Error && err.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }
    
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}