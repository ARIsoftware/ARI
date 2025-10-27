import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, createErrorResponse } from '@/lib/api-helpers'
import { z } from 'zod'

const updateColorSchema = z.object({
  goal_id: z.string().uuid(),
  box_index: z.number().int().min(0).max(17),
  color: z.enum(['light-grey', 'dark-grey', 'black', 'green', 'red'])
})

export async function GET(request: NextRequest) {
  try {
    const { user, supabase } = await getAuthenticatedUser()

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    // Fetch all contribution graph boxes for the user
    const { data, error } = await supabase
      .from('contribution_graph')
      .select('*')
      .eq('user_id', user.id)
      .order('box_index', { ascending: true })

    if (error) {
      console.error('Error fetching contribution graph:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data || [])
  } catch (err) {
    console.error('API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    // Validate request body
    const validation = await validateRequestBody(request, updateColorSchema)
    if (!validation.success) {
      return validation.response
    }

    const { goal_id, box_index, color } = validation.data
    const { user, supabase } = await getAuthenticatedUser()

    if (!user) {
      return createErrorResponse('Authentication required', 401)
    }

    // Use upsert to insert or update the box color
    const { data, error } = await supabase
      .from('contribution_graph')
      .upsert({
        user_id: user.id,
        goal_id,
        box_index,
        color,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,goal_id,box_index'
      })
      .select()
      .single()

    if (error) {
      console.error('Error updating contribution graph:', error)
      return createErrorResponse(error.message, 500)
    }

    return NextResponse.json(data, { status: 200 })
  } catch (err) {
    console.error('API error:', err)
    return createErrorResponse('Internal server error', 500)
  }
}
