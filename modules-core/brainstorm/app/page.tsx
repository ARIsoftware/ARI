'use client'

import { useEffect, useState } from 'react'
import { useModuleEnabled } from '@/lib/modules/module-hooks'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, Plus, Trash2, Network } from 'lucide-react'
import {
  useBrainstormBoard,
  useBrainstormBoards,
  useCreateBrainstormBoard,
  useDeleteBrainstormBoard,
} from '../hooks/use-brainstorm'
import BrainstormCanvas from '../components/canvas'

export default function BrainstormPage() {
  const { toast } = useToast()
  const { enabled: quotesEnabled, loading: quotesLoading } = useModuleEnabled('quotes')
  const [randomQuote, setRandomQuote] = useState<{ quote: string; author?: string } | null>(null)

  const { data: boards = [], isLoading: boardsLoading } = useBrainstormBoards()
  const createBoard = useCreateBrainstormBoard()
  const deleteBoard = useDeleteBrainstormBoard()

  const [selectedId, setSelectedId] = useState<string>('')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [nameError, setNameError] = useState('')

  const { data: currentBoard, isLoading: boardLoading } = useBrainstormBoard(selectedId)

  // Auto-select first board
  useEffect(() => {
    if (!selectedId && boards.length > 0) setSelectedId(boards[0].id)
  }, [boards, selectedId])

  // Random quote
  useEffect(() => {
    if (!quotesEnabled || quotesLoading) return
    let cancelled = false
    fetch('/api/modules/quotes/quotes')
      .then((res) => (res.ok ? res.json() : []))
      .then((quotes) => {
        if (!cancelled && quotes.length > 0) {
          setRandomQuote(quotes[Math.floor(Math.random() * quotes.length)])
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [quotesEnabled, quotesLoading])

  const handleCreate = () => {
    const trimmed = newName.trim()
    if (!trimmed) {
      setNameError('Board name is required')
      return
    }
    if (trimmed.length > 200) {
      setNameError('Board name must be 200 characters or less')
      return
    }
    setNameError('')
    createBoard.mutate(
      { name: trimmed },
      {
        onSuccess: (board) => {
          setSelectedId(board.id)
          setCreating(false)
          setNewName('')
        },
        onError: (err) => {
          toast({ variant: 'destructive', title: 'Failed to create board', description: err.message })
        },
      }
    )
  }

  const handleDelete = () => {
    if (!selectedId) return
    if (!confirm('Delete this board and all its ideas?')) return
    const id = selectedId
    deleteBoard.mutate(id, {
      onSuccess: () => {
        setSelectedId('')
      },
      onError: (err) => {
        toast({ variant: 'destructive', title: 'Failed to delete board', description: err.message })
      },
    })
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-4xl font-medium">Brainstorm</h1>
          {quotesEnabled && randomQuote && (
            <p className="text-sm text-[#aa2020] mt-1">{randomQuote.quote}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {boards.length > 0 && (
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Select a board" />
              </SelectTrigger>
              <SelectContent>
                {boards.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name} ({b.node_count})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button onClick={() => { setCreating(true); setNewName(''); setNameError('') }}>
            <Plus className="w-4 h-4 mr-1" /> New board
          </Button>
          {selectedId && (
            <Button variant="outline" onClick={handleDelete} disabled={deleteBoard.isPending}>
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {creating && (
        <Card>
          <CardContent className="p-4 flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <Input
                autoFocus
                value={newName}
                onChange={(e) => { setNewName(e.target.value); if (nameError) setNameError('') }}
                placeholder="Board name"
                className={nameError ? 'border-red-500 focus-visible:ring-red-500' : ''}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreate() }}
              />
              {nameError && <p className="text-xs text-red-500">{nameError}</p>}
            </div>
            <Button onClick={handleCreate} disabled={createBoard.isPending}>
              {createBoard.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create'}
            </Button>
            <Button variant="ghost" onClick={() => { setCreating(false); setNameError('') }}>Cancel</Button>
          </CardContent>
        </Card>
      )}

      {boardsLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : boards.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            <Network className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="mb-4">No boards yet. Create one to start brainstorming.</p>
            <Button onClick={() => { setCreating(true); setNewName('') }}>
              <Plus className="w-4 h-4 mr-1" /> New board
            </Button>
          </CardContent>
        </Card>
      ) : boardLoading || !currentBoard ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <BrainstormCanvas key={currentBoard.id} board={currentBoard} />
      )}
    </div>
  )
}
