import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedSupabaseClient } from '@/lib/supabase-auth-api'

export async function GET(request: NextRequest) {
  try {
    console.log('🔍 API /tasks called with authentication')

    // Create authenticated Supabase client (this will throw if not authenticated)
    const { supabase, userId } = await createAuthenticatedSupabaseClient()
    console.log('✅ User authenticated:', userId)

    const { data, error } = await supabase
      .from('ari-database')
      .select('*')
      .order('order_index', { ascending: true })

    if (error) {
      console.error('❌ Supabase error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log('✅ Tasks fetched:', data?.length || 0, 'tasks')
    return NextResponse.json(data)
  } catch (err) {
    console.error('❌ API error:', err)
    
    // Handle authentication errors specifically
    if (err instanceof Error && err.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }
    
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { task } = await request.json()

    // Create authenticated Supabase client
    const { supabase, userId } = await createAuthenticatedSupabaseClient()
    console.log('✅ User authenticated for POST:', userId)

    // Get the highest order_index
    const { data: maxOrderData } = await supabase
      .from('ari-database')
      .select('order_index')
      .order('order_index', { ascending: false })
      .limit(1)

    const nextOrderIndex = maxOrderData && maxOrderData.length > 0 ? (maxOrderData[0].order_index || 0) + 1 : 0

    const { data, error } = await supabase
      .from('ari-database')
      .insert([{
        ...task,
        order_index: nextOrderIndex,
      }])
      .select()
      .single()

    if (error) {
      console.error('Error creating task:', error)
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

export async function PUT(request: NextRequest) {
  try {
    const { id, updates } = await request.json()
    
    if (!id) {
      return NextResponse.json({ error: 'Task ID is required' }, { status: 400 })
    }

    // Create authenticated Supabase client
    const { supabase, userId } = await createAuthenticatedSupabaseClient()
    console.log('✅ User authenticated for PUT:', userId)

    const { data, error } = await supabase
      .from('ari-database')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating task:', error)
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

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    
    if (!id) {
      return NextResponse.json({ error: 'Task ID is required' }, { status: 400 })
    }

    // Create authenticated Supabase client
    const { supabase, userId } = await createAuthenticatedSupabaseClient()
    console.log('✅ User authenticated for DELETE:', userId)

    const { error } = await supabase
      .from('ari-database')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting task:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('API error:', err)
    
    if (err instanceof Error && err.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }
    
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}