import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { z } from 'zod'

// Validation schema for goal updates
const goalUpdateSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(2000).optional(),
  status: z.enum(['active', 'completed', 'archived']).optional(),
  progress: z.number().min(0).max(100).optional(),
  target_date: z.string().optional(),
}).strict()  // Reject unknown properties

// Validate UUID format
const uuidSchema = z.string().uuid('Invalid goal ID format')

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    const goalId = params.id
    const { user, supabase } = await getAuthenticatedUser()

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    // Validate goal ID is a valid UUID
    const idValidation = uuidSchema.safeParse(goalId)
    if (!idValidation.success) {
      return NextResponse.json({ error: 'Invalid goal ID format' }, { status: 400 })
    }

    // Validate request body
    const bodyValidation = goalUpdateSchema.safeParse(body)
    if (!bodyValidation.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: bodyValidation.error.errors },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from("northstar")
      .update({ ...bodyValidation.data, updated_at: new Date().toISOString() })
      .eq('id', goalId)
      .eq('user_id', user.id)  // Defense-in-depth: explicit user filtering
      .select()
      .single()

    if (error) {
      console.error('Error updating goal:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (err) {
    console.error('API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}