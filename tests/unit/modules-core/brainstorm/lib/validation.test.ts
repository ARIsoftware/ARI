import { describe, it, expect } from 'vitest'
import {
  createBrainstormBoardSchema,
  saveBrainstormBoardSchema,
  brainstormBoardIdParamSchema,
  BrainstormBoardSummarySchema,
  BrainstormBoardListResponseSchema,
  BrainstormBoardCreateResponseSchema,
  BrainstormBoardDetailResponseSchema,
  BrainstormBoardSaveResponseSchema,
  BrainstormBoardDeleteResponseSchema,
  BrainstormStatsResponseSchema,
} from '@/modules-core/brainstorm/lib/validation'
import { BRAINSTORM_COLORS } from '@/modules-core/brainstorm/types'

const VALID_UUID = '123e4567-e89b-12d3-a456-426614174000'
const VALID_UUID2 = '223e4567-e89b-12d3-a456-426614174001'

// ─── createBrainstormBoardSchema ──────────────────────────────────────────────

describe('createBrainstormBoardSchema', () => {
  it('accepts valid board name', () => {
    expect(createBrainstormBoardSchema.safeParse({ name: 'My Board' }).success).toBe(true)
  })

  it('rejects empty name', () => {
    expect(createBrainstormBoardSchema.safeParse({ name: '' }).success).toBe(false)
  })

  it('rejects name exceeding 200 chars', () => {
    expect(createBrainstormBoardSchema.safeParse({ name: 'a'.repeat(201) }).success).toBe(false)
  })

  it('accepts name at exactly 200 chars', () => {
    expect(createBrainstormBoardSchema.safeParse({ name: 'a'.repeat(200) }).success).toBe(true)
  })

  it('rejects missing name', () => {
    expect(createBrainstormBoardSchema.safeParse({}).success).toBe(false)
  })
})

// ─── saveBrainstormBoardSchema ────────────────────────────────────────────────

describe('saveBrainstormBoardSchema', () => {
  const validNode = {
    id: VALID_UUID,
    text: 'Some idea',
    x: 100,
    y: 200,
    color: BRAINSTORM_COLORS[0],
  }
  const validEdge = {
    id: VALID_UUID,
    source_node_id: VALID_UUID,
    target_node_id: VALID_UUID2,
  }
  const valid = { name: 'Board', nodes: [validNode], edges: [validEdge] }

  it('accepts valid board with nodes and edges', () => {
    expect(saveBrainstormBoardSchema.safeParse(valid).success).toBe(true)
  })

  it('accepts empty nodes and edges arrays', () => {
    expect(saveBrainstormBoardSchema.safeParse({ name: 'Board', nodes: [], edges: [] }).success).toBe(true)
  })

  it('rejects empty name', () => {
    expect(saveBrainstormBoardSchema.safeParse({ ...valid, name: '' }).success).toBe(false)
  })

  it('rejects name exceeding 200 chars', () => {
    expect(saveBrainstormBoardSchema.safeParse({ ...valid, name: 'a'.repeat(201) }).success).toBe(false)
  })

  it('rejects node with non-UUID id', () => {
    const badNode = { ...validNode, id: 'not-a-uuid' }
    expect(saveBrainstormBoardSchema.safeParse({ ...valid, nodes: [badNode] }).success).toBe(false)
  })

  it('rejects node text exceeding 500 chars', () => {
    const badNode = { ...validNode, text: 'x'.repeat(501) }
    expect(saveBrainstormBoardSchema.safeParse({ ...valid, nodes: [badNode] }).success).toBe(false)
  })

  it('accepts node text at exactly 500 chars', () => {
    const okNode = { ...validNode, text: 'x'.repeat(500) }
    expect(saveBrainstormBoardSchema.safeParse({ ...valid, nodes: [okNode] }).success).toBe(true)
  })

  it('rejects node with infinite x', () => {
    const badNode = { ...validNode, x: Infinity }
    expect(saveBrainstormBoardSchema.safeParse({ ...valid, nodes: [badNode] }).success).toBe(false)
  })

  it('rejects node with infinite y', () => {
    const badNode = { ...validNode, y: -Infinity }
    expect(saveBrainstormBoardSchema.safeParse({ ...valid, nodes: [badNode] }).success).toBe(false)
  })

  it('accepts negative finite coordinates', () => {
    const okNode = { ...validNode, x: -50.5, y: -100 }
    expect(saveBrainstormBoardSchema.safeParse({ ...valid, nodes: [okNode] }).success).toBe(true)
  })

  it('rejects node with invalid color', () => {
    const badNode = { ...validNode, color: 'rainbow' }
    expect(saveBrainstormBoardSchema.safeParse({ ...valid, nodes: [badNode] }).success).toBe(false)
  })

  it('accepts all valid brainstorm colors', () => {
    for (const color of BRAINSTORM_COLORS) {
      const node = { ...validNode, color }
      expect(saveBrainstormBoardSchema.safeParse({ ...valid, nodes: [node] }).success).toBe(true)
    }
  })

  it('rejects edge with non-UUID source_node_id', () => {
    const badEdge = { ...validEdge, source_node_id: 'bad' }
    expect(saveBrainstormBoardSchema.safeParse({ ...valid, edges: [badEdge] }).success).toBe(false)
  })

  it('rejects edge with non-UUID target_node_id', () => {
    const badEdge = { ...validEdge, target_node_id: 'bad' }
    expect(saveBrainstormBoardSchema.safeParse({ ...valid, edges: [badEdge] }).success).toBe(false)
  })

  it('rejects edge with non-UUID id', () => {
    const badEdge = { ...validEdge, id: 'not-uuid' }
    expect(saveBrainstormBoardSchema.safeParse({ ...valid, edges: [badEdge] }).success).toBe(false)
  })
})

// ─── brainstormBoardIdParamSchema ─────────────────────────────────────────────

describe('brainstormBoardIdParamSchema', () => {
  it('accepts valid UUID', () => {
    expect(brainstormBoardIdParamSchema.safeParse({ id: VALID_UUID }).success).toBe(true)
  })

  it('rejects non-UUID', () => {
    expect(brainstormBoardIdParamSchema.safeParse({ id: 'not-uuid' }).success).toBe(false)
  })
})

// ─── BrainstormBoardSummarySchema ─────────────────────────────────────────────

describe('BrainstormBoardSummarySchema', () => {
  const valid = {
    id: VALID_UUID,
    user_id: 'user1',
    name: 'Board',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: null,
    node_count: 5,
  }

  it('accepts valid summary', () => {
    expect(BrainstormBoardSummarySchema.safeParse(valid).success).toBe(true)
  })

  it('accepts null created_at', () => {
    expect(BrainstormBoardSummarySchema.safeParse({ ...valid, created_at: null }).success).toBe(true)
  })

  it('accepts null updated_at', () => {
    expect(BrainstormBoardSummarySchema.safeParse({ ...valid, updated_at: null }).success).toBe(true)
  })

  it('rejects negative node_count', () => {
    expect(BrainstormBoardSummarySchema.safeParse({ ...valid, node_count: -1 }).success).toBe(false)
  })

  it('rejects non-integer node_count', () => {
    expect(BrainstormBoardSummarySchema.safeParse({ ...valid, node_count: 1.5 }).success).toBe(false)
  })
})

// ─── List / Create / Detail response schemas ──────────────────────────────────

describe('BrainstormBoardListResponseSchema', () => {
  it('accepts empty boards array', () => {
    expect(BrainstormBoardListResponseSchema.safeParse({ boards: [] }).success).toBe(true)
  })
})

describe('BrainstormBoardCreateResponseSchema', () => {
  const board = {
    id: VALID_UUID,
    user_id: 'u',
    name: 'B',
    created_at: null,
    updated_at: null,
    node_count: 0,
  }
  it('accepts valid create response', () => {
    expect(BrainstormBoardCreateResponseSchema.safeParse({ board }).success).toBe(true)
  })
})

describe('BrainstormBoardDetailResponseSchema', () => {
  const board = {
    id: VALID_UUID,
    user_id: 'u',
    name: 'B',
    created_at: null,
    updated_at: null,
    nodes: [],
    edges: [],
  }
  it('accepts valid detail response', () => {
    expect(BrainstormBoardDetailResponseSchema.safeParse({ board }).success).toBe(true)
  })
})

describe('BrainstormBoardSaveResponseSchema', () => {
  const board = {
    id: VALID_UUID,
    user_id: 'u',
    name: 'B',
    created_at: null,
    updated_at: null,
    nodes: [],
    edges: [],
  }
  it('accepts valid save response', () => {
    expect(BrainstormBoardSaveResponseSchema.safeParse({ board, message: 'Saved' }).success).toBe(true)
  })
})

// ─── BrainstormBoardDeleteResponseSchema ──────────────────────────────────────

describe('BrainstormBoardDeleteResponseSchema', () => {
  it('accepts valid delete response', () => {
    expect(BrainstormBoardDeleteResponseSchema.safeParse({ success: true, message: 'Deleted' }).success).toBe(true)
  })

  it('rejects success: false', () => {
    expect(BrainstormBoardDeleteResponseSchema.safeParse({ success: false, message: 'Nope' }).success).toBe(false)
  })
})

// ─── BrainstormStatsResponseSchema ───────────────────────────────────────────

describe('BrainstormStatsResponseSchema', () => {
  it('accepts valid stats', () => {
    expect(BrainstormStatsResponseSchema.safeParse({ total_ideas_created: 10, total_boards: 2 }).success).toBe(true)
  })

  it('rejects negative total_ideas_created', () => {
    expect(BrainstormStatsResponseSchema.safeParse({ total_ideas_created: -1, total_boards: 0 }).success).toBe(false)
  })

  it('rejects negative total_boards', () => {
    expect(BrainstormStatsResponseSchema.safeParse({ total_ideas_created: 0, total_boards: -1 }).success).toBe(false)
  })

  it('rejects non-integer values', () => {
    expect(BrainstormStatsResponseSchema.safeParse({ total_ideas_created: 1.5, total_boards: 0 }).success).toBe(false)
  })
})
