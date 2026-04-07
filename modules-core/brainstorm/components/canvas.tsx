'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Handle,
  Position,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Button } from '@/components/ui/button'
import { Plus, Save, Loader2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useSaveBrainstormBoard } from '@/modules/brainstorm/hooks/use-brainstorm'
import { BRAINSTORM_COLORS, type BrainstormBoard, type BrainstormColor } from '@/modules/brainstorm/types'

const COLOR_CLASSES: Record<BrainstormColor, string> = {
  slate: 'bg-slate-700 text-white border-slate-800',
  red: 'bg-red-500 text-white border-red-600',
  orange: 'bg-orange-500 text-white border-orange-600',
  amber: 'bg-amber-500 text-white border-amber-600',
  green: 'bg-green-600 text-white border-green-700',
  teal: 'bg-teal-500 text-white border-teal-600',
  sky: 'bg-sky-500 text-white border-sky-600',
  blue: 'bg-blue-600 text-white border-blue-700',
  violet: 'bg-violet-500 text-white border-violet-600',
  pink: 'bg-pink-500 text-white border-pink-600',
}

interface IdeaNodeData {
  text: string
  color: BrainstormColor
  onChange: (id: string, text: string) => void
  onCycleColor: (id: string) => void
}

function IdeaNode({ id, data }: NodeProps) {
  const { text, color, onChange, onCycleColor } = data as unknown as IdeaNodeData
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(text)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setDraft(text) }, [text])
  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  const commit = () => {
    setEditing(false)
    if (draft !== text) onChange(id, draft)
  }

  return (
    <div
      className={`rounded-md border px-3 py-1.5 shadow-sm text-sm font-medium ${COLOR_CLASSES[color] || COLOR_CLASSES.slate}`}
      onDoubleClick={(e) => { e.stopPropagation(); setEditing(true) }}
    >
      <Handle type="target" position={Position.Left} className="!bg-white/60 !w-2 !h-2" />
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') { setDraft(text); setEditing(false) }
          }}
          className="bg-transparent outline-none border-b border-white/40 min-w-[60px]"
        />
      ) : (
        <span
          onClick={(e) => {
            if (e.shiftKey) { e.stopPropagation(); onCycleColor(id) }
          }}
          className="cursor-text select-none"
        >
          {text || 'New idea'}
        </span>
      )}
      <Handle type="source" position={Position.Right} className="!bg-white/60 !w-2 !h-2" />
    </div>
  )
}

const nodeTypes = { idea: IdeaNode }

interface CanvasInnerProps {
  board: BrainstormBoard
}

function CanvasInner({ board }: CanvasInnerProps) {
  const { toast } = useToast()
  const saveBoard = useSaveBrainstormBoard(board.id)
  const [dirty, setDirty] = useState(false)

  const updateNodeText = useCallback((id: string, text: string) => {
    setNodes((cur) => cur.map((n) => n.id === id ? { ...n, data: { ...n.data, text } } : n))
    setDirty(true)
  }, [])

  const cycleNodeColor = useCallback((id: string) => {
    setNodes((cur) => cur.map((n) => {
      if (n.id !== id) return n
      const idx = BRAINSTORM_COLORS.indexOf((n.data as any).color)
      const next = BRAINSTORM_COLORS[(idx + 1) % BRAINSTORM_COLORS.length]
      return { ...n, data: { ...n.data, color: next } }
    }))
    setDirty(true)
  }, [])

  const initialNodes: Node[] = useMemo(() => board.nodes.map((n) => ({
    id: n.id,
    type: 'idea',
    position: { x: n.x, y: n.y },
    data: { text: n.text, color: n.color, onChange: updateNodeText, onCycleColor: cycleNodeColor },
  })), [board.id])  // eslint-disable-line react-hooks/exhaustive-deps

  const initialEdges: Edge[] = useMemo(() => board.edges.map((e) => ({
    id: e.id,
    source: e.source_node_id,
    target: e.target_node_id,
  })), [board.id])

  const [nodes, setNodes] = useState<Node[]>(initialNodes)
  const [edges, setEdges] = useState<Edge[]>(initialEdges)

  // Reset when board changes
  useEffect(() => {
    setNodes(initialNodes)
    setEdges(initialEdges)
    setDirty(false)
  }, [board.id, initialNodes, initialEdges])

  // Re-bind callbacks (they may go stale across renders)
  useEffect(() => {
    setNodes((cur) => cur.map((n) => ({
      ...n,
      data: { ...n.data, onChange: updateNodeText, onCycleColor: cycleNodeColor },
    })))
  }, [updateNodeText, cycleNodeColor])

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((nds) => applyNodeChanges(changes, nds))
    if (changes.some((c) => c.type === 'position' && c.dragging === false)) setDirty(true)
    if (changes.some((c) => c.type === 'remove')) setDirty(true)
  }, [])

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((eds) => applyEdgeChanges(changes, eds))
    if (changes.some((c) => c.type === 'remove')) setDirty(true)
  }, [])

  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) return
    setEdges((eds) => {
      // prevent duplicates
      if (eds.some((e) => e.source === connection.source && e.target === connection.target)) return eds
      return addEdge({ ...connection, id: crypto.randomUUID() }, eds)
    })
    setDirty(true)
  }, [])

  const handleAddNode = () => {
    const id = crypto.randomUUID()
    const x = 100 + Math.random() * 400
    const y = 100 + Math.random() * 300
    setNodes((cur) => [
      ...cur,
      {
        id,
        type: 'idea',
        position: { x, y },
        data: { text: '', color: 'slate' as BrainstormColor, onChange: updateNodeText, onCycleColor: cycleNodeColor },
      },
    ])
    setDirty(true)
  }

  const handleSave = () => {
    saveBoard.mutate(
      {
        name: board.name,
        nodes: nodes.map((n) => ({
          id: n.id,
          text: ((n.data as any).text as string) || '',
          x: n.position.x,
          y: n.position.y,
          color: ((n.data as any).color as BrainstormColor) || 'slate',
        })),
        edges: edges.map((e) => ({
          id: e.id,
          source_node_id: e.source,
          target_node_id: e.target,
        })),
      },
      {
        onSuccess: () => {
          setDirty(false)
          toast({ title: 'Board saved' })
        },
        onError: (err) => {
          toast({ variant: 'destructive', title: 'Failed to save board', description: err.message })
        },
      }
    )
  }

  return (
    <div className="relative h-[calc(100vh-220px)] min-h-[500px] w-full border rounded-lg overflow-hidden bg-background">
      <div className="absolute top-3 left-3 z-10 flex gap-2">
        <Button size="sm" onClick={handleAddNode}>
          <Plus className="w-4 h-4 mr-1" /> Add idea
        </Button>
        <Button size="sm" variant={dirty ? 'default' : 'outline'} onClick={handleSave} disabled={saveBoard.isPending || !dirty}>
          {saveBoard.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
          {dirty ? 'Save' : 'Saved'}
        </Button>
      </div>
      <div className="absolute top-3 right-3 z-10 text-xs text-muted-foreground bg-background/80 backdrop-blur px-2 py-1 rounded">
        Double-click a card to edit · Shift-click to change color · Drag handles to connect
      </div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        fitView
        deleteKeyCode={['Backspace', 'Delete']}
      >
        <Background />
        <Controls />
        <MiniMap pannable zoomable />
      </ReactFlow>
    </div>
  )
}

export default function BrainstormCanvas({ board }: { board: BrainstormBoard }) {
  return (
    <ReactFlowProvider>
      <CanvasInner board={board} />
    </ReactFlowProvider>
  )
}
