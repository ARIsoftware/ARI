/**
 * Assignable people — every ARI account, for the task assignee picker.
 *
 * GET /api/modules/tasks/users → { users: [{ id, name }] }
 *
 * The Better Auth `user` table is shared (not per-user), so any authenticated
 * account may list names here — only id + display name are exposed.
 */
import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { createErrorResponse } from '@/lib/api-helpers'
import { withAdminDb } from '@/lib/db'
import { user } from '@/lib/db/schema'
import { AssignableUsersResponseSchema } from '@/modules/tasks/lib/validation'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, InternalServerErrorResponse, UnauthorizedResponse } from '@/lib/openapi/common'

registry.registerPath({
  method: 'get',
  path: '/api/modules/tasks/users',
  operationId: 'listAssignableUsers',
  summary: 'List ARI accounts that a task can be assigned to',
  tags: ['tasks'],
  security: DEFAULT_SECURITY,
  responses: {
    200: {
      description: 'All ARI accounts (id + display name)',
      content: { 'application/json': { schema: AssignableUsersResponseSchema } },
    },
    401: UnauthorizedResponse,
    500: InternalServerErrorResponse,
  },
})

export async function GET() {
  try {
    const { user: me } = await getAuthenticatedUser()
    if (!me) return createErrorResponse('Unauthorized', 401)

    // The shared Better Auth `user` table has a deny-all RLS policy
    // (user_rls_deny in setup.sql) — reads must go through withAdminDb,
    // matching how auth-helpers itself resolves accounts.
    const rows = await withAdminDb((db) =>
      db
        .select({
          id: user.id,
          name: user.name,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
        })
        // No orderBy: the picker sorts client-side (current user first, then
        // by resolved display name, which may not be the raw name column).
        .from(user),
    )

    // Never expose another account's full email address as a display name:
    // fall back to the local part only (before the @).
    const users = rows.map((r) => ({
      id: r.id,
      name:
        r.name?.trim() ||
        [r.firstName, r.lastName].filter(Boolean).join(' ').trim() ||
        r.email.split('@')[0],
    }))

    return NextResponse.json({ users })
  } catch (error) {
    console.error('GET /api/modules/tasks/users:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}
