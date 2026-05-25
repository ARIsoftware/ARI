import { NextRequest, NextResponse } from 'next/server'
import { and, asc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { toSnakeCase } from '@/lib/api-helpers'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import type { DrizzleDb } from '@/lib/db'
import {
  brainstormBoardIdParamSchema as ParamsSchema,
  saveBrainstormBoardSchema as SaveBoardSchema,
  BrainstormBoardDetailResponseSchema,
  BrainstormBoardSaveResponseSchema,
  BrainstormBoardDeleteResponseSchema,
} from '@/modules/brainstorm/lib/validation'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse } from '@/lib/openapi/common'
import { brainstormBoards, brainstormEdges, brainstormNodes } from '@/lib/db/schema'

registry.registerPath({
  method: 'get',
  path: '/api/modules/brainstorm/boards/{id}',
  operationId: 'getBrainstormBoard',
  summary: 'Load a brainstorm board with all nodes and edges',
  tags: ['brainstorm'],
  security: DEFAULT_SECURITY,
  request: { params: ParamsSchema },
  responses: {
    200: { description: 'Board with graph', content: { 'application/json': { schema: BrainstormBoardDetailResponseSchema } } },
    400: { description: 'Validation error', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    404: { description: 'Board not found', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

registry.registerPath({
  method: 'put',
  path: '/api/modules/brainstorm/boards/{id}',
  operationId: 'saveBrainstormBoard',
  summary: "Replace a board's full content (name, all nodes, all edges) in a single transaction",
  tags: ['brainstorm'],
  security: DEFAULT_SECURITY,
  request: {
    params: ParamsSchema,
    body: { content: { 'application/json': { schema: SaveBoardSchema } } },
  },
  responses: {
    200: { description: 'Saved board (loaded post-write)', content: { 'application/json': { schema: BrainstormBoardSaveResponseSchema } } },
    400: { description: 'Validation error or invalid graph (self-loop / dangling edge / duplicate)', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    404: { description: 'Board not found', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

registry.registerPath({
  method: 'delete',
  path: '/api/modules/brainstorm/boards/{id}',
  operationId: 'deleteBrainstormBoard',
  summary: 'Delete a brainstorm board (cascades to nodes and edges)',
  tags: ['brainstorm'],
  security: DEFAULT_SECURITY,
  request: { params: ParamsSchema },
  responses: {
    200: { description: 'Deletion acknowledged', content: { 'application/json': { schema: BrainstormBoardDeleteResponseSchema } } },
    400: { description: 'Validation error', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

function validateGraph(nodes: z.infer<typeof SaveBoardSchema>['nodes'], edges: z.infer<typeof SaveBoardSchema>['edges']) {
  const nodeIds = new Set(nodes.map((n) => n.id))
  const seen = new Set<string>()
  for (const e of edges) {
    if (e.source_node_id === e.target_node_id) return 'A node cannot connect to itself'
    if (!nodeIds.has(e.source_node_id) || !nodeIds.has(e.target_node_id)) {
      return 'Every edge must reference nodes that exist on the board'
    }
    const key = `${e.source_node_id}:${e.target_node_id}`
    if (seen.has(key)) return 'Duplicate edges are not allowed'
    seen.add(key)
  }
  return null
}

async function loadBoard(withRLS: <T>(operation: (db: DrizzleDb) => Promise<T>) => Promise<T>, boardId: string) {
  const boards = await withRLS((db) =>
    db.select().from(brainstormBoards).where(eq(brainstormBoards.id, boardId)).limit(1)
  )
  if (boards.length === 0) return null

  const [nodes, edges] = await Promise.all([
    withRLS((db) =>
      db.select().from(brainstormNodes).where(eq(brainstormNodes.boardId, boardId)).orderBy(asc(brainstormNodes.createdAt))
    ),
    withRLS((db) =>
      db.select().from(brainstormEdges).where(eq(brainstormEdges.boardId, boardId)).orderBy(asc(brainstormEdges.createdAt))
    ),
  ])

  // numeric/double precision comes back as number for doublePrecision in Drizzle, but normalize to be safe
  const normalizedNodes = nodes.map((n: Record<string, unknown>) => ({ ...n, x: Number(n.x), y: Number(n.y) }))

  return { ...boards[0], nodes: normalizedNodes, edges }
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return NextResponse.json({ error: 'Unauthorized - Valid authentication required' }, { status: 401 })
    }

    const parsed = ParamsSchema.safeParse(await params)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 })
    }

    const board = await loadBoard(withRLS, parsed.data.id)
    if (!board) return NextResponse.json({ error: 'Board not found' }, { status: 404 })

    return NextResponse.json({ board: toSnakeCase(board) })
  } catch (error) {
    console.error('GET /api/modules/brainstorm/boards/[id] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return NextResponse.json({ error: 'Unauthorized - Valid authentication required' }, { status: 401 })
    }

    const parsed = ParamsSchema.safeParse(await params)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 })
    }

    const body = await request.json()
    const parseResult = SaveBoardSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json({ error: 'Validation failed', details: parseResult.error.issues }, { status: 400 })
    }

    const graphError = validateGraph(parseResult.data.nodes, parseResult.data.edges)
    if (graphError) return NextResponse.json({ error: graphError }, { status: 400 })

    const existing = await loadBoard(withRLS, parsed.data.id)
    if (!existing) return NextResponse.json({ error: 'Board not found' }, { status: 404 })

    await withRLS((db) => db.transaction(async (tx) => {
      await tx.update(brainstormBoards)
        .set({
          name: parseResult.data.name.trim(),
          updatedAt: sql`timezone('utc'::text, now())`,
        })
        .where(eq(brainstormBoards.id, parsed.data.id))

      await tx.delete(brainstormEdges).where(eq(brainstormEdges.boardId, parsed.data.id))
      await tx.delete(brainstormNodes).where(eq(brainstormNodes.boardId, parsed.data.id))

      if (parseResult.data.nodes.length > 0) {
        await tx.insert(brainstormNodes).values(
          parseResult.data.nodes.map((n) => ({
            id: n.id,
            boardId: parsed.data.id,
            userId: user.id,
            text: n.text,
            x: n.x,
            y: n.y,
            color: n.color,
          }))
        )
      }

      if (parseResult.data.edges.length > 0) {
        await tx.insert(brainstormEdges).values(
          parseResult.data.edges.map((e) => ({
            id: e.id,
            boardId: parsed.data.id,
            userId: user.id,
            sourceNodeId: e.source_node_id,
            targetNodeId: e.target_node_id,
          }))
        )
      }
    }))

    const saved = await loadBoard(withRLS, parsed.data.id)
    return NextResponse.json({ board: toSnakeCase(saved), message: 'Board saved successfully' })
  } catch (error) {
    console.error('PUT /api/modules/brainstorm/boards/[id] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return NextResponse.json({ error: 'Unauthorized - Valid authentication required' }, { status: 401 })
    }

    const parsed = ParamsSchema.safeParse(await params)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 })
    }

    await withRLS((db) =>
      db.delete(brainstormBoards)
        .where(and(eq(brainstormBoards.id, parsed.data.id), eq(brainstormBoards.userId, user.id)))
    )

    return NextResponse.json({ success: true, message: 'Board deleted successfully' })
  } catch (error) {
    console.error('DELETE /api/modules/brainstorm/boards/[id] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
