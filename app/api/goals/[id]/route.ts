import { NextRequest, NextResponse } from "next/server"
import { createAuthenticatedSupabaseClient } from '@/lib/supabase-auth-api'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    const goalId = params.id
    
    if (!goalId) {
      return NextResponse.json({ error: 'Goal ID is required' }, { status: 400 })
    }

    const { supabase, userId } = await createAuthenticatedSupabaseClient()
    console.log('✅ User authenticated for PATCH:', userId)

    const { data, error } = await supabase
      .from("goals")
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('id', goalId)
      .select()
      .single()

    if (error) {
      console.error('Error updating goal:', error)
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