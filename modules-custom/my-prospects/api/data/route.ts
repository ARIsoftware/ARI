import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { toSnakeCase } from '@/lib/api-helpers'
import { z } from 'zod'
import { prospects } from '@/lib/db/schema'
import { eq, desc } from 'drizzle-orm'
import { POSITIONS } from '@/modules/my-prospects/types'

const CreateProspectSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200, 'Name must be 200 characters or less'),
  position: z.enum(POSITIONS, { errorMap: () => ({ message: 'Position must be PG, SG, SF, PF, or C' }) }),
  graduation_year: z.number().int('Year must be a whole number').min(2020, 'Year must be 2020 or later').max(2040, 'Year must be 2040 or earlier'),
  school: z.string().max(200, 'School must be 200 characters or less').default(''),
  height: z.string().max(20, 'Height must be 20 characters or less').default(''),
  rating: z.number().int('Rating must be a whole number').min(1, 'Rating must be between 1 and 5').max(5, 'Rating must be between 1 and 5'),
  notes: z.string().max(2000, 'Notes must be 2000 characters or less').optional(),
})

export async function GET() {
  try {
    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rows = await withRLS((db) =>
      db.select().from(prospects).orderBy(desc(prospects.evaluatedAt))
    )

    return NextResponse.json({ prospects: toSnakeCase(rows) })
  } catch (error) {
    console.error('GET /api/modules/my-prospects/data error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const parseResult = CreateProspectSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parseResult.error.issues },
        { status: 400 }
      )
    }

    const { name, position, graduation_year, school, height, rating, notes } = parseResult.data

    const data = await withRLS((db) =>
      db.insert(prospects).values({
        userId: user.id,
        name,
        position,
        graduationYear: graduation_year,
        school,
        height,
        rating,
        notes: notes || null,
      }).returning()
    )

    return NextResponse.json({ prospect: toSnakeCase(data[0]) }, { status: 201 })
  } catch (error) {
    console.error('POST /api/modules/my-prospects/data error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'Missing required parameter: id' }, { status: 400 })
    }

    const body = await request.json()
    const parseResult = CreateProspectSchema.partial().safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parseResult.error.issues },
        { status: 400 }
      )
    }

    const updates: Record<string, any> = {}
    const d = parseResult.data
    if (d.name !== undefined) updates.name = d.name
    if (d.position !== undefined) updates.position = d.position
    if (d.graduation_year !== undefined) updates.graduationYear = d.graduation_year
    if (d.school !== undefined) updates.school = d.school
    if (d.height !== undefined) updates.height = d.height
    if (d.rating !== undefined) updates.rating = d.rating
    if (d.notes !== undefined) updates.notes = d.notes || null
    updates.evaluatedAt = new Date().toISOString()

    const data = await withRLS((db) =>
      db.update(prospects).set(updates).where(eq(prospects.id, id)).returning()
    )

    if (data.length === 0) {
      return NextResponse.json({ error: 'Prospect not found' }, { status: 404 })
    }

    return NextResponse.json({ prospect: toSnakeCase(data[0]) })
  } catch (error) {
    console.error('PATCH /api/modules/my-prospects/data error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'Missing required parameter: id' }, { status: 400 })
    }

    await withRLS((db) => db.delete(prospects).where(eq(prospects.id, id)))

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/modules/my-prospects/data error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
