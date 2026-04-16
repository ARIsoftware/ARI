import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { pool } from '@/lib/db/pool'
import { z } from 'zod'

const MigrateSchema = z.object({
  moduleId: z.string().regex(/^[a-z0-9-]{1,64}$/),
  migrations: z.array(z.object({
    name: z.string().max(255),
    sql: z.string().max(1_048_576), // 1MB per migration
  })).min(1).max(50),
})

export async function POST(request: NextRequest) {
  const { user } = await getAuthenticatedUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!pool) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
  }

  try {
    const body = await request.json()
    const parseResult = MigrateSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parseResult.error.flatten() },
        { status: 400 }
      )
    }

    const { moduleId, migrations } = parseResult.data
    const results: Array<{ name: string; status: 'applied' | 'skipped' | 'failed'; error?: string }> = []
    const client = await pool.connect()

    try {
      for (const migration of migrations) {
        try {
          // Check if migration already applied
          const existing = await client.query(
            'SELECT id FROM module_migrations WHERE module_id = $1 AND migration_name = $2',
            [moduleId, migration.name]
          )

          if (existing.rows.length > 0) {
            results.push({ name: migration.name, status: 'skipped' })
            continue
          }

          // Apply migration in a transaction
          await client.query('BEGIN')
          await client.query(migration.sql)
          await client.query(
            'INSERT INTO module_migrations (module_id, migration_name, applied_by) VALUES ($1, $2, $3::uuid)',
            [moduleId, migration.name, user.id]
          )
          await client.query('COMMIT')
          results.push({ name: migration.name, status: 'applied' })
        } catch (err: unknown) {
          await client.query('ROLLBACK').catch(() => {})
          console.error(`[API /modules/migrate] Migration "${migration.name}" failed for ${moduleId}:`, err)
          results.push({ name: migration.name, status: 'failed', error: err instanceof Error ? err.message : String(err) })
          // Stop processing remaining migrations on failure
          break
        }
      }
    } finally {
      client.release()
    }

    const allSucceeded = results.every(r => r.status === 'applied' || r.status === 'skipped')

    return NextResponse.json({
      success: allSucceeded,
      results,
    })
  } catch (error: unknown) {
    console.error('[API /modules/migrate] Error:', error)
    return NextResponse.json(
      { error: 'Failed to run migrations' },
      { status: 500 }
    )
  }
}
