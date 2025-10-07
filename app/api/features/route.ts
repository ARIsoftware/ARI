import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, createErrorResponse } from '@/lib/api-helpers'
import { z } from 'zod'

const featureToggleSchema = z.object({
  feature_name: z.string(),
  enabled: z.boolean()
})

export async function GET(request: NextRequest) {
  try {
    const { user, supabase } = await getAuthenticatedUser()

    if (!user) {
      return createErrorResponse('Authentication required', 401)
    }

    // Fetch user's feature preferences with RLS
    const { data, error } = await supabase
      .from('user_feature_preferences')
      .select('*')

    if (error) {
      console.error('Error fetching feature preferences:', error)
      return createErrorResponse(error.message, 500)
    }

    return NextResponse.json(data || [])
  } catch (err) {
    console.error('API error:', err)
    return createErrorResponse('Internal server error', 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    const validation = await validateRequestBody(request, featureToggleSchema)
    if (!validation.success) {
      return validation.response
    }

    const { feature_name, enabled } = validation.data
    const { user, supabase } = await getAuthenticatedUser()

    if (!user) {
      return createErrorResponse('Authentication required', 401)
    }

    // Upsert the feature preference
    const { data, error } = await supabase
      .from('user_feature_preferences')
      .upsert({
        user_id: user.id,
        feature_name,
        enabled
      }, {
        onConflict: 'user_id,feature_name'
      })
      .select()
      .single()

    if (error) {
      console.error('Error updating feature preference:', error)
      return createErrorResponse(error.message, 500)
    }

    return NextResponse.json(data)
  } catch (err) {
    console.error('API error:', err)
    return createErrorResponse('Internal server error', 500)
  }
}
