import { NextRequest, NextResponse } from "next/server"
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY!

const supabase = createClient(supabaseUrl, supabaseSecretKey)

export async function GET(request: NextRequest) {
  try {
    console.log('🔍 API /goals called')
    console.log('Environment check:', {
      hasUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      hasSecret: !!process.env.SUPABASE_SECRET_KEY,
      url: process.env.NEXT_PUBLIC_SUPABASE_URL,
      secretStart: process.env.SUPABASE_SECRET_KEY?.substring(0, 10) + '...'
    })

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
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { goal } = await request.json()

    const { data, error } = await supabase
      .from("goals")
      .insert([{
        ...goal,
        progress: 0,
        user_email: "hello@ari.software", // Single user app
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
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}