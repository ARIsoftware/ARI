import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, createErrorResponse, toSnakeCase } from '@/lib/api-helpers'
import { z } from 'zod'
import { userFeaturePreferences } from '@/lib/db/schema'
import { eq, and, sql } from 'drizzle-orm'

const featureToggleSchema = z.object({
  feature_name: z.string(),
  enabled: z.boolean()
})

export async function GET(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    // Return empty array for unauthenticated users (e.g., on sign-in page)
    // Features will default to enabled per features-context.tsx
    if (!user || !withRLS) {
      return NextResponse.json([])
    }

    const data = await withRLS((db) =>
      db.select().from(userFeaturePreferences).where(eq(userFeaturePreferences.userId, user.id))
    )

    return NextResponse.json(toSnakeCase(data) || [])
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
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return createErrorResponse('Authentication required', 401)
    }

    const existing = await withRLS((db) =>
      db.select({ id: userFeaturePreferences.id })
        .from(userFeaturePreferences)
        .where(and(eq(userFeaturePreferences.userId, user.id), eq(userFeaturePreferences.featureName, feature_name)))
        .limit(1)
    )

    let data
    if (existing.length > 0) {
      // Update existing
      const updated = await withRLS((db) =>
        db.update(userFeaturePreferences)
          .set({
            enabled,
            updatedAt: sql`timezone('utc'::text, now())`
          })
          .where(eq(userFeaturePreferences.id, existing[0].id))
          .returning()
      )
      data = updated[0]
    } else {
      // Insert new
      const inserted = await withRLS((db) =>
        db.insert(userFeaturePreferences)
          .values({
            userId: user.id,
            featureName: feature_name,
            enabled
          })
          .returning()
      )
      data = inserted[0]
    }

    return NextResponse.json(toSnakeCase(data))
  } catch (err) {
    console.error('API error:', err)
    return createErrorResponse('Internal server error', 500)
  }
}
