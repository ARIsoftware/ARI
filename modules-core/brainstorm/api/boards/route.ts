import { NextRequest, NextResponse } from 'next/server'
import { desc, inArray } from 'drizzle-orm'
import { toSnakeCase } from '@/lib/api-helpers'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import {
  createBrainstormBoardSchema as CreateBoardSchema,
  BrainstormBoardListResponseSchema,
  BrainstormBoardCreateResponseSchema,
} from '@/modules/brainstorm/lib/validation'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse } from '@/lib/openapi/common'
import { brainstormBoards, brainstormNodes } from '@/lib/db/schema'

registry.registerPath({
  method: 'get',
  path: '/api/modules/brainstorm/boards',
  operationId: 'listBrainstormBoards',
  summary: "List the user's brainstorm boards with node counts",
  tags: ['brainstorm'],
  security: DEFAULT_SECURITY,
  responses: {
    200: { description: 'Boards (most recently updated first)', content: { 'application/json': { schema: BrainstormBoardListResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

registry.registerPath({
  method: 'post',
  path: '/api/modules/brainstorm/boards',
  operationId: 'createBrainstormBoard',
  summary: 'Create a new brainstorm board',
  tags: ['brainstorm'],
  security: DEFAULT_SECURITY,
  request: { body: { content: { 'application/json': { schema: CreateBoardSchema } } } },
  responses: {
    201: { description: 'Created board (with node_count: 0)', content: { 'application/json': { schema: BrainstormBoardCreateResponseSchema } } },
    400: { description: 'Validation error', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

export async function GET(_request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return NextResponse.json({ error: 'Unauthorized - Valid authentication required' }, { status: 401 })
    }

    const boards = await withRLS((db) =>
      db.select().from(brainstormBoards).orderBy(desc(brainstormBoards.updatedAt))
    )

    if (boards.length === 0) {
      return NextResponse.json({ boards: [] })
    }

    const boardIds = boards.map((b) => b.id)
    const nodes = await withRLS((db) =>
      db.select({ boardId: brainstormNodes.boardId })
        .from(brainstormNodes)
        .where(inArray(brainstormNodes.boardId, boardIds))
    )

    const counts = new Map<string, number>()
    for (const n of nodes) counts.set(n.boardId, (counts.get(n.boardId) || 0) + 1)

    const summaries = boards.map((b) => ({ ...b, nodeCount: counts.get(b.id) || 0 }))

    return NextResponse.json({ boards: toSnakeCase(summaries) })
  } catch (error) {
    console.error('GET /api/modules/brainstorm/boards error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return NextResponse.json({ error: 'Unauthorized - Valid authentication required' }, { status: 401 })
    }

    const body = await request.json()
    const parseResult = CreateBoardSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json({ error: 'Validation failed', details: parseResult.error.issues }, { status: 400 })
    }

    const [created] = await withRLS((db) =>
      db.insert(brainstormBoards)
        .values({ userId: user.id, name: parseResult.data.name.trim() })
        .returning()
    )

    return NextResponse.json({ board: toSnakeCase({ ...created, nodeCount: 0 }) }, { status: 201 })
  } catch (error) {
    console.error('POST /api/modules/brainstorm/boards error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
