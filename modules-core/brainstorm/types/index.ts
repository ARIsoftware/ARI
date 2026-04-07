export const BRAINSTORM_COLORS = [
  'slate',
  'red',
  'orange',
  'amber',
  'green',
  'teal',
  'sky',
  'blue',
  'violet',
  'pink',
] as const

export type BrainstormColor = typeof BRAINSTORM_COLORS[number]

export interface BrainstormNode {
  id: string
  board_id: string
  user_id: string
  text: string
  x: number
  y: number
  color: BrainstormColor
  created_at: string
  updated_at: string | null
}

export interface BrainstormEdge {
  id: string
  board_id: string
  user_id: string
  source_node_id: string
  target_node_id: string
  created_at: string
}

export interface BrainstormBoardSummary {
  id: string
  user_id: string
  name: string
  node_count: number
  created_at: string
  updated_at: string | null
}

export interface BrainstormBoard {
  id: string
  user_id: string
  name: string
  created_at: string
  updated_at: string | null
  nodes: BrainstormNode[]
  edges: BrainstormEdge[]
}

export interface CreateBrainstormBoardRequest {
  name: string
}

export interface SaveBrainstormBoardRequest {
  name: string
  nodes: Array<{
    id: string
    text: string
    x: number
    y: number
    color: BrainstormColor
  }>
  edges: Array<{
    id: string
    source_node_id: string
    target_node_id: string
  }>
}

export interface BrainstormStatsResponse {
  total_ideas_created: number
  total_boards: number
}
