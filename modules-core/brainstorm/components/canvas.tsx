'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Background,
  BaseEdge,
  ConnectionMode,
  Controls,
  EdgeLabelRenderer,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  getBezierPath,
  Handle,
  Position,
  type Connection,
  type Edge,
  type EdgeChange,
  type EdgeProps,
  type Node,
  type NodeChange,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Button } from '@/components/ui/button'
import { Plus, Save, Loader2, X, Pencil, Palette, Lock, Unlock } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useSaveBrainstormBoard } from '@/modules/brainstorm/hooks/use-brainstorm'
import { BRAINSTORM_COLORS, type BrainstormBoard, type BrainstormColor } from '@/modules/brainstorm/types'

const COLOR_CARD_CLASSES: Record<BrainstormColor, string> = {
  slate:  'bg-slate-50 border-slate-200 dark:bg-slate-900/40 dark:border-slate-700',
  red:    'bg-red-50 border-red-200 dark:bg-red-950/40 dark:border-red-800',
  orange: 'bg-orange-50 border-orange-200 dark:bg-orange-950/40 dark:border-orange-800',
  amber:  'bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:border-amber-800',
  green:  'bg-green-50 border-green-200 dark:bg-green-950/40 dark:border-green-800',
  teal:   'bg-teal-50 border-teal-200 dark:bg-teal-950/40 dark:border-teal-800',
  sky:    'bg-sky-50 border-sky-200 dark:bg-sky-950/40 dark:border-sky-800',
  blue:   'bg-blue-50 border-blue-200 dark:bg-blue-950/40 dark:border-blue-800',
  violet: 'bg-violet-50 border-violet-200 dark:bg-violet-950/40 dark:border-violet-800',
  pink:   'bg-pink-50 border-pink-200 dark:bg-pink-950/40 dark:border-pink-800',
}

interface IdeaNodeData {
  text: string
  color: BrainstormColor
  index: number
  onChange: (id: string, text: string) => void
  onCycleColor: (id: string) => void
  onDelete: (id: string) => void
  onAddChild: (id: string) => void
}

const HANDLE_CLASS = '!w-3 !h-3 !bg-transparent !border !border-gray-300'

function IdeaNode({ id, data }: NodeProps) {
  const { text, color, index, onChange, onCycleColor, onDelete, onAddChild } = data as unknown as IdeaNodeData
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(text)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (!editing) setDraft(text) }, [text, editing])
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  const startEdit = () => {
    setDraft(text)
    setEditing(true)
  }

  const commit = () => {
    setEditing(false)
    if (draft !== text) onChange(id, draft)
  }

  const cardClass = COLOR_CARD_CLASSES[color] || COLOR_CARD_CLASSES.slate

  return (
    <div
      className={`group relative min-w-[170px] rounded-lg border shadow-sm px-2.5 py-1.5 ${cardClass}`}
    >
      <Handle id="t" type="source" position={Position.Top} className={HANDLE_CLASS} />
      <Handle id="l" type="source" position={Position.Left} className={HANDLE_CLASS} />
      <Handle id="r" type="source" position={Position.Right} className={HANDLE_CLASS} />
      <Handle id="b" type="source" position={Position.Bottom} className={HANDLE_CLASS} />

      <div className="absolute -top-2 -right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onAddChild(id) }}
          className="h-4 w-4 rounded-full bg-background border border-border text-muted-foreground hover:text-foreground hover:border-foreground flex items-center justify-center"
          title="Add connected card"
        >
          <Plus className="h-2.5 w-2.5" />
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onCycleColor(id) }}
          className="h-4 w-4 rounded-full bg-background border border-border text-muted-foreground hover:text-foreground hover:border-foreground flex items-center justify-center"
          title="Change color"
        >
          <Palette className="h-2.5 w-2.5" />
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); startEdit() }}
          className="h-4 w-4 rounded-full bg-background border border-border text-muted-foreground hover:text-foreground hover:border-foreground flex items-center justify-center"
          title="Edit text"
        >
          <Pencil className="h-2.5 w-2.5" />
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(id) }}
          className="h-4 w-4 rounded-full bg-background border border-border text-muted-foreground hover:text-destructive hover:border-destructive flex items-center justify-center"
          title="Delete card"
        >
          <X className="h-2.5 w-2.5" />
        </button>
      </div>

      <div className="text-[10px] font-semibold text-foreground">
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
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-transparent outline-none border-b border-border"
          />
        ) : (
          <span className="cursor-text select-none">
            {index}. {text || 'New idea'}
          </span>
        )}
      </div>
    </div>
  )
}

const nodeTypes = { idea: IdeaNode }

interface DeletableEdgeData {
  onDelete?: (id: string) => void
}

function DeletableEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, selected, data }: EdgeProps) {
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })
  return (
    <>
      <BaseEdge id={id} path={path} style={{ strokeWidth: selected ? 2 : 1.5 }} />
      {selected && (
        <EdgeLabelRenderer>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); (data as DeletableEdgeData | undefined)?.onDelete?.(id) }}
            style={{ position: 'absolute', transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, pointerEvents: 'all' }}
            className="h-5 w-5 rounded-full bg-background border border-border text-muted-foreground hover:text-destructive hover:border-destructive flex items-center justify-center shadow-sm"
            title="Delete connection"
          >
            <X className="h-3 w-3" />
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

const edgeTypes = { deletable: DeletableEdge }

const edgeKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

interface CanvasInnerProps {
  board: BrainstormBoard
}

function CanvasInner({ board }: CanvasInnerProps) {
  const { toast } = useToast()
  const saveBoard = useSaveBrainstormBoard(board.id)
  const [dirty, setDirty] = useState(false)
  const [locked, setLocked] = useState(false)
  const [pendingHref, setPendingHref] = useState<string | null>(null)
  const dirtyRef = useRef(false)
  useEffect(() => { dirtyRef.current = dirty }, [dirty])

  const updateNodeText = useCallback((id: string, text: string) => {
    setNodes((cur) => cur.map((n) => n.id === id ? { ...n, data: { ...n.data, text } } : n))
    setDirty(true)
  }, [])

  const deleteNode = useCallback((id: string) => {
    setNodes((cur) => cur.filter((n) => n.id !== id))
    setEdges((cur) => cur.filter((e) => e.source !== id && e.target !== id))
    setDirty(true)
  }, [])

  const deleteEdge = useCallback((id: string) => {
    setEdges((cur) => cur.filter((e) => e.id !== id))
    setDirty(true)
  }, [])

  const addChildNode = useCallback((parentId: string) => {
    const newId = crypto.randomUUID()
    setNodes((cur) => {
      const parent = cur.find((n) => n.id === parentId)
      const px = parent?.position.x ?? 100
      const py = parent?.position.y ?? 100
      return [
        ...cur,
        {
          id: newId,
          type: 'idea',
          position: { x: px + 220, y: py },
          data: {
            text: '',
            color: 'slate' as BrainstormColor,
            index: 0,
            onChange: updateNodeText,
            onCycleColor: cycleNodeColor,
            onDelete: deleteNode,
            onAddChild: addChildNode,
          },
        },
      ]
    })
    setEdges((cur) => [
      ...cur,
      {
        id: crypto.randomUUID(),
        source: parentId,
        target: newId,
        type: 'deletable',
        data: { onDelete: deleteEdge },
      },
    ])
    setDirty(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const initialNodes: Node[] = useMemo(() => board.nodes.map((n, i) => ({
    id: n.id,
    type: 'idea',
    position: { x: n.x, y: n.y },
    data: { text: n.text, color: n.color, index: i + 1, onChange: updateNodeText, onCycleColor: cycleNodeColor, onDelete: deleteNode, onAddChild: addChildNode },
  })), [board.id])  // eslint-disable-line react-hooks/exhaustive-deps

  const initialEdges: Edge[] = useMemo(() => board.edges.map((e) => ({
    id: e.id,
    source: e.source_node_id,
    target: e.target_node_id,
    type: 'deletable',
    data: { onDelete: deleteEdge },
  })), [board.id])  // eslint-disable-line react-hooks/exhaustive-deps

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
      data: { ...n.data, onChange: updateNodeText, onCycleColor: cycleNodeColor, onDelete: deleteNode, onAddChild: addChildNode },
    })))
    setEdges((cur) => cur.map((e) => ({
      ...e,
      data: { ...e.data, onDelete: deleteEdge },
    })))
  }, [updateNodeText, cycleNodeColor, deleteNode, deleteEdge, addChildNode])

  // Re-stamp index numbering whenever the node list length changes
  useEffect(() => {
    setNodes((cur) => cur.map((n, i) => (
      (n.data as any).index === i + 1 ? n : { ...n, data: { ...n.data, index: i + 1 } }
    )))
  }, [nodes.length])

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
      // dedupe regardless of direction
      const newKey = edgeKey(connection.source!, connection.target!)
      if (eds.some((e) => edgeKey(e.source, e.target) === newKey)) return eds
      return addEdge(
        { ...connection, id: crypto.randomUUID(), type: 'deletable', data: { onDelete: deleteEdge } },
        eds
      )
    })
    setDirty(true)
  }, [deleteEdge])

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
        data: { text: '', color: 'slate' as BrainstormColor, index: 0, onChange: updateNodeText, onCycleColor: cycleNodeColor, onDelete: deleteNode, onAddChild: addChildNode },
      },
    ])
    setDirty(true)
  }

  // Warn on tab close / refresh
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  // Intercept in-app link clicks while dirty
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!dirtyRef.current) return
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const target = (e.target as HTMLElement | null)?.closest('a') as HTMLAnchorElement | null
      if (!target) return
      const href = target.getAttribute('href')
      if (!href || href.startsWith('http') || href.startsWith('#') || target.target === '_blank') return
      // Same-origin nav: intercept
      e.preventDefault()
      setPendingHref(href)
    }
    document.addEventListener('click', handler, true)
    return () => document.removeEventListener('click', handler, true)
  }, [])

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
        <Button size="sm" onClick={handleAddNode} disabled={locked}>
          <Plus className="w-4 h-4 mr-1" /> Add idea
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saveBoard.isPending || locked}>
          {saveBoard.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
          Save
        </Button>
        <Button size="sm" variant="destructive" onClick={() => setLocked((v) => !v)}>
          {locked ? <Lock className="w-4 h-4 mr-1" /> : <Unlock className="w-4 h-4 mr-1" />}
          {locked ? 'Locked' : 'Unlocked'}
        </Button>
      </div>
      <div className="absolute top-3 right-3 z-10 text-xs text-muted-foreground bg-background/80 backdrop-blur px-2 py-1 rounded">
        Hover a card for actions · Drag handles to connect · Click a line to delete
      </div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        connectionMode={ConnectionMode.Loose}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        fitView
        deleteKeyCode={locked ? null : ['Backspace', 'Delete']}
        nodesDraggable={!locked}
        nodesConnectable={!locked}
        elementsSelectable={!locked}
      >
        <Background />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable />
      </ReactFlow>
      <AlertDialog open={pendingHref !== null} onOpenChange={(open) => { if (!open) setPendingHref(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes to this board. Save before leaving?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay</AlertDialogCancel>
            <Button
              variant="outline"
              onClick={() => {
                const href = pendingHref
                setDirty(false)
                dirtyRef.current = false
                setPendingHref(null)
                if (href) window.location.href = href
              }}
            >
              Discard
            </Button>
            <AlertDialogAction
              onClick={() => {
                const href = pendingHref
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
                      dirtyRef.current = false
                      setPendingHref(null)
                      if (href) window.location.href = href
                    },
                    onError: (err) => {
                      toast({ variant: 'destructive', title: 'Failed to save', description: err.message })
                      setPendingHref(null)
                    },
                  }
                )
              }}
            >
              Save & leave
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
