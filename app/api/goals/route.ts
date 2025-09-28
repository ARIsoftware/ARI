import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, createErrorResponse } from '@/lib/api-helpers'
import { createGoalSchema } from '@/lib/validation'

export async function GET(request: NextRequest) {
  try {
    const { user, supabase } = await getAuthenticatedUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { data, error } = await supabase
      .from("northstar")
      .select("*")
      .order("created_at", { ascending: false })

    if (error) {
      console.error('Error fetching goals:', error)
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
    // Validate request body
    const validation = await validateRequestBody(request, createGoalSchema)
    if (!validation.success) {
      return validation.response
    }

    const { goal } = validation.data
    const { user, supabase } = await getAuthenticatedUser()
    
    if (!user) {
      return createErrorResponse('Authentication required', 401)
    }

    // Handle empty deadline string - convert to null for DATE field
    const goalData = {
      ...goal,
      deadline: goal.deadline && goal.deadline !== '' ? goal.deadline : null,
      progress: 0,
      user_id: user.id
    }

    const { data, error } = await supabase
      .from("northstar")
      .insert([goalData])
      .select()
      .single()

    if (error) {
      console.error('Error creating goal:', error)
      return createErrorResponse(error.message, 500)
    }

    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    console.error('API error:', err)
    return createErrorResponse('Internal server error', 500)
  }
}