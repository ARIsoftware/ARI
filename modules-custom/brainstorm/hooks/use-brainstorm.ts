'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  BrainstormBoard,
  BrainstormBoardSummary,
  BrainstormStatsResponse,
  CreateBrainstormBoardRequest,
  SaveBrainstormBoardRequest,
} from '@/modules/brainstorm/types'

const boardsKey = ['brainstorm-boards']
const boardKey = (id: string) => ['brainstorm-board', id]
const statsKey = ['brainstorm-stats']

async function readJsonError(res: Response, fallback: string) {
  const err = await res.json().catch(() => ({}))
  const details = Array.isArray(err.details)
    ? err.details.map((item: any) => item.message).join(', ')
    : undefined
  throw new Error(details || err.error || fallback)
}

export function useBrainstormBoards() {
  return useQuery({
    queryKey: boardsKey,
    queryFn: async (): Promise<BrainstormBoardSummary[]> => {
      const res = await fetch('/api/modules/brainstorm/boards')
      if (!res.ok) await readJsonError(res, 'Failed to fetch boards')
      const data = await res.json()
      return data.boards || []
    },
  })
}

export function useCreateBrainstormBoard() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CreateBrainstormBoardRequest): Promise<BrainstormBoardSummary> => {
      const res = await fetch('/api/modules/brainstorm/boards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) await readJsonError(res, 'Failed to create board')
      const data = await res.json()
      return data.board
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: boardsKey })
      queryClient.invalidateQueries({ queryKey: statsKey })
    },
  })
}

export function useDeleteBrainstormBoard() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const res = await fetch(`/api/modules/brainstorm/boards/${id}`, { method: 'DELETE' })
      if (!res.ok) await readJsonError(res, 'Failed to delete board')
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: boardsKey })
      queryClient.removeQueries({ queryKey: boardKey(id) })
      queryClient.invalidateQueries({ queryKey: statsKey })
    },
  })
}

export function useBrainstormBoard(id: string) {
  return useQuery({
    queryKey: boardKey(id),
    enabled: Boolean(id),
    queryFn: async (): Promise<BrainstormBoard> => {
      const res = await fetch(`/api/modules/brainstorm/boards/${id}`)
      if (!res.ok) await readJsonError(res, 'Failed to fetch board')
      const data = await res.json()
      return data.board
    },
  })
}

export function useSaveBrainstormBoard(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: SaveBrainstormBoardRequest): Promise<BrainstormBoard> => {
      const res = await fetch(`/api/modules/brainstorm/boards/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) await readJsonError(res, 'Failed to save board')
      const data = await res.json()
      return data.board
    },
    onSuccess: (board) => {
      queryClient.setQueryData(boardKey(id), board)
      queryClient.invalidateQueries({ queryKey: boardsKey })
      queryClient.invalidateQueries({ queryKey: statsKey })
    },
  })
}

export function useBrainstormStats() {
  return useQuery({
    queryKey: statsKey,
    queryFn: async (): Promise<BrainstormStatsResponse> => {
      const res = await fetch('/api/modules/brainstorm/stats')
      if (!res.ok) await readJsonError(res, 'Failed to fetch stats')
      return res.json()
    },
  })
}
