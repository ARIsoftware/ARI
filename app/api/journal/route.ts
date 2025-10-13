import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'

export async function GET(request: NextRequest) {
  try {
    const { user, supabase } = await getAuthenticatedUser()

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const entryType = searchParams.get('entry_type') || 'winter_arc'

    const { data, error } = await supabase
      .from('journal')
      .select('*')
      .eq('entry_type', entryType)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error('Error fetching journal entry:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (err) {
    console.error('API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { entry } = await request.json()
    const { user, supabase } = await getAuthenticatedUser()

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const entryType = entry.entry_type || 'winter_arc'

    // Check if entry already exists
    const { data: existingEntry } = await supabase
      .from('journal')
      .select('id')
      .eq('entry_type', entryType)
      .maybeSingle()

    if (existingEntry) {
      // Update existing entry
      const { data, error } = await supabase
        .from('journal')
        .update({
          ...entry,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingEntry.id)
        .select()
        .single()

      if (error) {
        console.error('Error updating journal entry:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json(data)
    } else {
      // Create new entry
      const { data, error } = await supabase
        .from('journal')
        .insert([{
          ...entry,
          user_id: user.id,
          entry_type: entryType,
        }])
        .select()
        .single()

      if (error) {
        console.error('Error creating journal entry:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json(data)
    }
  } catch (err) {
    console.error('API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
