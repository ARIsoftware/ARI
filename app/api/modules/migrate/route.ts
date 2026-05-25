import { NextResponse } from 'next/server'
import { registry } from '@/lib/openapi/registry'
import { ErrorResponseSchema } from '@/lib/openapi/common'

registry.registerPath({
  method: 'post',
  path: '/api/modules/migrate',
  operationId: 'modulesMigrate_DEPRECATED',
  summary: 'DEPRECATED — always returns 410 Gone',
  description: 'Removed for security. Module schema install is now handled server-side by /api/modules/download.',
  tags: ['app'],
  deprecated: true,
  responses: {
    410: { description: 'Gone — endpoint removed', content: { 'application/json': { schema: ErrorResponseSchema } } },
  },
})

/**
 * This route was deprecated and removed for security reasons.
 *
 * Previous behavior accepted { moduleId, migrations: [{ name, sql }] } from
 * any authenticated user and ran the SQL on a connection that bypasses RLS.
 * Any signed-up user could post arbitrary DDL/DML — DROP TABLE "user", etc.
 *
 * Module schema installation now runs server-side as part of
 * /api/modules/download via lib/modules/schema-installer.ts. Only the
 * literal file <module>/database/schema.sql is read; nothing else.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: 'gone',
      message:
        '/api/modules/migrate has been removed. Module schema install is ' +
        'now handled server-side by /api/modules/download.',
    },
    { status: 410 }
  )
}
