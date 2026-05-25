import { z } from 'zod'
import '@/lib/openapi/registry'
import { BRAINSTORM_COLORS } from '../types'

export const createBrainstormBoardSchema = z.object({
  name: z.string().min(1, 'Board name is required').max(200, 'Board name must be 200 characters or less'),
}).openapi('CreateBrainstormBoardBody')

const NodeInputSchema = z.object({
  id: z.string().uuid('Node id must be a valid UUID'),
  text: z.string().max(500, 'Node text must be 500 characters or less'),
  x: z.number().finite('x must be a finite number'),
  y: z.number().finite('y must be a finite number'),
  color: z.enum([...BRAINSTORM_COLORS] as [string, ...string[]], { message: 'Node color is invalid' }),
})

const EdgeInputSchema = z.object({
  id: z.string().uuid('Edge id must be a valid UUID'),
  source_node_id: z.string().uuid('Source node id must be a valid UUID'),
  target_node_id: z.string().uuid('Target node id must be a valid UUID'),
})

export const saveBrainstormBoardSchema = z.object({
  name: z.string().min(1, 'Board name is required').max(200, 'Board name must be 200 characters or less'),
  nodes: z.array(NodeInputSchema),
  edges: z.array(EdgeInputSchema),
}).openapi('SaveBrainstormBoardBody')

export const brainstormBoardIdParamSchema = z.object({
  id: z.string().uuid('Board id must be a valid UUID'),
})

export const BrainstormBoardSummarySchema = z.object({
  id: z.string().uuid(),
  user_id: z.string(),
  name: z.string(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
  node_count: z.number().int().nonnegative(),
}).openapi('BrainstormBoardSummary')

export const BrainstormBoardListResponseSchema = z.object({
  boards: z.array(BrainstormBoardSummarySchema),
}).openapi('BrainstormBoardListResponse')

export const BrainstormBoardCreateResponseSchema = z.object({
  board: BrainstormBoardSummarySchema,
}).openapi('BrainstormBoardCreateResponse')

const BrainstormNodeSchema = z.object({
  id: z.string().uuid(),
  board_id: z.string().uuid(),
  user_id: z.string(),
  text: z.string(),
  x: z.number(),
  y: z.number(),
  color: z.string(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
}).openapi('BrainstormNode')

const BrainstormEdgeSchema = z.object({
  id: z.string().uuid(),
  board_id: z.string().uuid(),
  user_id: z.string(),
  source_node_id: z.string().uuid(),
  target_node_id: z.string().uuid(),
  created_at: z.string().nullable(),
}).openapi('BrainstormEdge')

const BrainstormBoardWithGraphSchema = BrainstormBoardSummarySchema
  .omit({ node_count: true })
  .extend({
    nodes: z.array(BrainstormNodeSchema),
    edges: z.array(BrainstormEdgeSchema),
  })
  .openapi('BrainstormBoardWithGraph')

export const BrainstormBoardDetailResponseSchema = z.object({
  board: BrainstormBoardWithGraphSchema,
}).openapi('BrainstormBoardDetailResponse')

export const BrainstormBoardSaveResponseSchema = z.object({
  board: BrainstormBoardWithGraphSchema,
  message: z.string(),
}).openapi('BrainstormBoardSaveResponse')

export const BrainstormBoardDeleteResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
}).openapi('BrainstormBoardDeleteResponse')

export const BrainstormStatsResponseSchema = z.object({
  total_ideas_created: z.number().int().nonnegative(),
  total_boards: z.number().int().nonnegative(),
}).openapi('BrainstormStatsResponse')
