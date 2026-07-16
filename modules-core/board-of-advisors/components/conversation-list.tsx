'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Loader2, MessagesSquare, MoreHorizontal, Pencil, Search, SquarePen, Trash2, Users } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { cn, formatRelativeTime } from '@/lib/utils'
import {
  useBoardConversations,
  useDeleteBoardConversation,
  useRenameBoardConversation,
} from '@/modules/board-of-advisors/hooks/use-board-of-advisors'
import { destructiveToast } from '@/modules/board-of-advisors/lib/utils'
import { ConfirmDeleteDialog } from './confirm-delete-dialog'
import { RenameDialog } from './rename-dialog'
import type { BoardConversation } from '@/modules/board-of-advisors/types'

interface ConversationListProps {
  activeId: string | null
  onSelect: (id: string) => void
  onCreate: () => void
  isCreating: boolean
}

const GROUP_ORDER = ['Today', 'Yesterday', 'Previous 7 days', 'Previous 30 days', 'Older'] as const
type GroupLabel = (typeof GROUP_ORDER)[number]

function bucketFor(dateString: string): GroupLabel {
  const date = new Date(dateString)
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const diffDays = Math.floor((startOfToday.getTime() - date.getTime()) / 86400000)
  if (date >= startOfToday) return 'Today'
  if (diffDays < 1) return 'Yesterday'
  if (diffDays < 7) return 'Previous 7 days'
  if (diffDays < 30) return 'Previous 30 days'
  return 'Older'
}

function groupConversations(convos: BoardConversation[]): [GroupLabel, BoardConversation[]][] {
  const map = new Map<GroupLabel, BoardConversation[]>()
  for (const c of convos) {
    const key = bucketFor(c.updated_at)
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(c)
  }
  return GROUP_ORDER.filter((g) => map.has(g)).map((g) => [g, map.get(g)!])
}

export function ConversationList({ activeId, onSelect, onCreate, isCreating }: ConversationListProps) {
  const { data: conversations = [], isLoading } = useBoardConversations()
  const renameMutation = useRenameBoardConversation()
  const deleteMutation = useDeleteBoardConversation()
  const { toast } = useToast()

  const [query, setQuery] = useState('')
  const [renaming, setRenaming] = useState<BoardConversation | null>(null)
  const [deleting, setDeleting] = useState<BoardConversation | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return conversations
    return conversations.filter((c) => c.title.toLowerCase().includes(q))
  }, [conversations, query])

  const grouped = useMemo(() => groupConversations(filtered), [filtered])

  const handleRename = (title: string) => {
    if (!renaming) return
    renameMutation.mutate(
      { id: renaming.id, title },
      {
        onSuccess: () => setRenaming(null),
        onError: (err) => toast(destructiveToast('Failed to rename discussion', err)),
      },
    )
  }

  const handleDelete = () => {
    if (!deleting) return
    deleteMutation.mutate(deleting.id, {
      onSuccess: () => {
        if (activeId === deleting.id) onSelect('')
        setDeleting(null)
      },
      onError: (err) => toast(destructiveToast('Failed to delete discussion', err)),
    })
  }

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r bg-background">
      {/* New discussion */}
      <div className="p-3">
        <button
          type="button"
          onClick={onCreate}
          disabled={isCreating}
          className="group flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-60"
        >
          {isCreating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <SquarePen className="h-4 w-4 transition-transform group-hover:scale-110" />
          )}
          New discussion
        </button>
      </div>

      {/* Search */}
      <div className="px-3 pb-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search discussions..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-9 pl-9"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto border-t">
        {isLoading ? (
          <div className="space-y-px p-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center px-4 py-12 text-center">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10">
              <Users className="h-5 w-5 text-accent" />
            </div>
            <p className="text-sm font-medium">{query ? 'No matches' : 'No discussions yet'}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {query ? 'Try a different search.' : 'Convene your board above.'}
            </p>
          </div>
        ) : (
          grouped.map(([label, convos]) => (
            <div key={label}>
              <p className="sticky top-0 z-10 bg-background/90 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 backdrop-blur-sm">
                {label}
              </p>
              {convos.map((convo) => {
                const isActive = convo.id === activeId
                return (
                  <div
                    key={convo.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelect(convo.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        onSelect(convo.id)
                      }
                    }}
                    className={cn(
                      'group flex cursor-pointer items-start gap-2.5 border-b border-l-2 p-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      isActive
                        ? 'border-l-accent bg-muted'
                        : 'border-l-transparent hover:bg-muted/50',
                    )}
                  >
                    <MessagesSquare
                      className={cn(
                        'mt-0.5 h-4 w-4 shrink-0',
                        isActive ? 'text-accent' : 'text-muted-foreground',
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <h3 className={cn('line-clamp-1 text-sm leading-tight', isActive ? 'font-semibold' : 'font-medium')}>
                        {convo.title}
                      </h3>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {formatRelativeTime(new Date(convo.updated_at))}
                      </p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Discussion actions for ${convo.title}`}
                          className="h-7 w-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenuItem onSelect={() => setRenaming(convo)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-red-600 focus:text-red-600"
                          onSelect={() => setDeleting(convo)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )
              })}
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t px-4 py-2 text-[11px] text-muted-foreground">
        <span>{conversations.length} discussion{conversations.length !== 1 ? 's' : ''}</span>
        {query && <span>{filtered.length} shown</span>}
      </div>

      <RenameDialog
        open={!!renaming}
        initialTitle={renaming?.title ?? ''}
        isPending={renameMutation.isPending}
        onCancel={() => setRenaming(null)}
        onSubmit={handleRename}
      />

      <ConfirmDeleteDialog
        open={!!deleting}
        title="Delete this discussion?"
        description={<>All messages in &ldquo;{deleting?.title}&rdquo; will be permanently removed.</>}
        isPending={deleteMutation.isPending}
        onConfirm={handleDelete}
        onOpenChange={(next) => { if (!next) setDeleting(null) }}
      />
    </aside>
  )
}
