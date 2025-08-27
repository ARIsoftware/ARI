import { NextRequest, NextResponse } from "next/server"
import { createAuthenticatedSupabaseClient } from '@/lib/supabase-auth-api'

export async function GET(request: NextRequest) {
  try {
    console.log('🔍 API /goals called with authentication')

    // Create authenticated Supabase client
    const { supabase, userId } = await createAuthenticatedSupabaseClient()
    console.log('✅ User authenticated:', userId)

    const { data, error } = await supabase
      .from("goals")
      .select("*")
      .order("created_at", { ascending: false })

    if (error) {
      console.error('❌ Supabase error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log('✅ Goals fetched:', data?.length || 0, 'goals')
    return NextResponse.json(data)
  } catch (err) {
    console.error('❌ API error:', err)
    
    if (err instanceof Error && err.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }
    
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { goal } = await request.json()

    // Create authenticated Supabase client
    const { supabase, userId } = await createAuthenticatedSupabaseClient()
    console.log('✅ User authenticated for POST:', userId)

    const { data, error } = await supabase
      .from("goals")
      .insert([{
        ...goal,
        progress: 0,
        // Note: Remove hardcoded user_email - let RLS handle user association
      }])
      .select()
      .single()

    if (error) {
      console.error('Error creating goal:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
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