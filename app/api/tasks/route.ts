import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY!

const supabase = createClient(supabaseUrl, supabaseSecretKey)

export async function GET(request: NextRequest) {
  try {
    console.log('🔍 API /tasks called')
    console.log('Environment check:', {
      hasUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      hasSecret: !!process.env.SUPABASE_SECRET_KEY,
      url: process.env.NEXT_PUBLIC_SUPABASE_URL,
      secretStart: process.env.SUPABASE_SECRET_KEY?.substring(0, 10) + '...'
    })
    
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    
    console.log('User ID:', userId)
    
    if (!userId) {
      console.log('❌ No user ID provided')
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('ari-database')
      .select('*')
      .eq('user_id', userId)
      .order('order_index', { ascending: true })

    if (error) {
      console.error('❌ Supabase error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log('✅ Tasks fetched:', data?.length || 0, 'tasks')
    return NextResponse.json(data)
  } catch (err) {
    console.error('❌ API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { task, userId } = await request.json()
    
    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
    }

    // Get the highest order_index for this user
    const { data: maxOrderData } = await supabase
      .from('ari-database')
      .select('order_index')
      .eq('user_id', userId)
      .order('order_index', { ascending: false })
      .limit(1)

    const nextOrderIndex = maxOrderData && maxOrderData.length > 0 ? (maxOrderData[0].order_index || 0) + 1 : 0

    const { data, error } = await supabase
      .from('ari-database')
      .insert([{
        ...task,
        user_id: userId,
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
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { id, updates, userId } = await request.json()
    
    if (!userId || !id) {
      return NextResponse.json({ error: 'User ID and task ID are required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('ari-database')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single()

    if (error) {
      console.error('Error updating task:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (err) {
    console.error('API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const userId = searchParams.get('userId')
    
    if (!userId || !id) {
      return NextResponse.json({ error: 'User ID and task ID are required' }, { status: 400 })
    }

    const { error } = await supabase
      .from('ari-database')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)

    if (error) {
      console.error('Error deleting task:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}