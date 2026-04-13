import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { z } from 'zod'
import { userPreferences } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { toSnakeCase } from '@/lib/api-helpers'

// Validation schema for user preferences
const userPreferencesSchema = z.object({
  name: z.string().max(255).optional().nullable(),
  email: z.string().max(255).optional().nullable(),
  title: z.string().max(255).optional().nullable(),
  company_name: z.string().max(255).optional().nullable(),
  country: z.string().max(100).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  linkedin_url: z.string().max(500).optional().nullable(),
  timezone: z.string().max(50).optional(),
})

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) {
    const msg = (error as Record<string, unknown>).message
    return typeof msg === 'string' ? msg : JSON.stringify(msg)
  }
  return String(error)
}

const DEFAULT_PREFS = (userId: string, email: string) => ({
  id: null,
  user_id: userId,
  name: null,
  email,
  title: null,
  company_name: null,
  country: null,
  city: null,
  linkedin_url: null,
  timezone: 'UTC',
})

export async function GET() {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rows = await withRLS((db) =>
      db.select().from(userPreferences).where(eq(userPreferences.userId, user.id)).limit(1)
    )

    if (rows.length === 0) {
      return NextResponse.json(DEFAULT_PREFS(user.id, user.email))
    }

    return NextResponse.json(toSnakeCase(rows[0]))
  } catch (error) {
    console.error('Failed to fetch user preferences:', error)
    return NextResponse.json(
      { error: 'Failed to fetch user preferences', message: getErrorMessage(error) },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()

    const validationResult = userPreferencesSchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validationResult.error.errors },
        { status: 400 }
      )
    }

    const validatedData = validationResult.data

    const result = await withRLS((db) =>
      db.insert(userPreferences)
        .values({
          userId: user.id,
          name: validatedData.name ?? null,
          email: validatedData.email ?? null,
          title: validatedData.title ?? null,
          companyName: validatedData.company_name ?? null,
          country: validatedData.country ?? null,
          city: validatedData.city ?? null,
          linkedinUrl: validatedData.linkedin_url ?? null,
          timezone: validatedData.timezone ?? 'UTC',
        })
        .onConflictDoUpdate({
          target: userPreferences.userId,
          set: {
            name: validatedData.name ?? null,
            email: validatedData.email ?? null,
            title: validatedData.title ?? null,
            companyName: validatedData.company_name ?? null,
            country: validatedData.country ?? null,
            city: validatedData.city ?? null,
            linkedinUrl: validatedData.linkedin_url ?? null,
            timezone: validatedData.timezone ?? 'UTC',
            updatedAt: new Date().toISOString(),
          },
        })
        .returning()
    )

    return NextResponse.json(toSnakeCase(result[0]))
  } catch (error) {
    console.error('Failed to save user preferences:', error)
    return NextResponse.json(
      { error: 'Failed to save user preferences', message: getErrorMessage(error) },
      { status: 500 }
    )
  }
}
