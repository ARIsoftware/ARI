'use client'

import { useState } from 'react'
import { ChevronRight, Star, Share2, Edit2, MoreHorizontal, Trash2, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { StatusBadge } from './status-badge'
import { TagInput } from './tag-input'
import type { KnowledgeArticle, KnowledgeCollection, ArticleStatus } from '../types'
import { formatDistanceToNow } from 'date-fns'

// Helper to safely format date
function safeFormatDistanceToNow(timestamp: string | null | undefined): string {
  if (!timestamp) return 'Unknown'
  try {
    const date = new Date(timestamp)
    if (isNaN(date.getTime())) return 'Unknown'
    return formatDistanceToNow(date, { addSuffix: true })
  } catch {
    return 'Unknown'
  }
}

interface DocumentViewProps {
  article: KnowledgeArticle | null
  collections: KnowledgeCollection[]
  allTags: string[]
  isEditing: boolean
  onToggleEdit: () => void
  onSave: (updates: Partial<KnowledgeArticle>) => void
  onToggleFavorite: () => void
  onDelete: () => void
  onRestore?: () => void
}

export function DocumentView({
  article,
  collections,
  allTags,
  isEditing,
  onToggleEdit,
  onSave,
  onToggleFavorite,
  onDelete,
  onRestore
}: DocumentViewProps) {
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const [editTags, setEditTags] = useState<string[]>([])
  const [editStatus, setEditStatus] = useState<ArticleStatus>('draft')
  const [editCollectionId, setEditCollectionId] = useState<string | null>(null)

  // Sync edit state when article changes or edit mode starts
  const startEditing = () => {
    if (article) {
      setEditTitle(article.title)
      setEditContent(article.content)
      setEditTags(article.tags)
      setEditStatus(article.status)
      setEditCollectionId(article.collection_id)
    }
    onToggleEdit()
  }

  const handleSave = () => {
    onSave({
      title: editTitle,
      content: editContent,
      tags: editTags,
      status: editStatus,
      collection_id: editCollectionId
    })
  }

  const handleCancel = () => {
    onToggleEdit()
  }

  if (!article) {
    return (
      <div className="flex-1 flex items-center justify-center bg-muted/30">
        <div className="text-center text-muted-foreground">
          <p className="text-lg font-medium">No document selected</p>
          <p className="text-sm mt-1">Select a document from the list to view its contents</p>
        </div>
      </div>
    )
  }

  const timeAgo = safeFormatDistanceToNow(article.updated_at)

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background">
      {/* Header with breadcrumb */}
      <div className="flex items-center justify-between px-6 py-3 border-b">
        <div className="flex items-center gap-2 text-sm">
          {article.collection ? (
            <>
              <span className="text-muted-foreground">{article.collection.name}</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </>
          ) : (
            <>
              <span className="text-muted-foreground">All Documents</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </>
          )}
          <span className="font-medium truncate max-w-[200px]">{article.title}</span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleFavorite}
            className={article.is_favorite ? 'text-amber-500' : ''}
          >
            <Star className="h-4 w-4" fill={article.is_favorite ? 'currentColor' : 'none'} />
          </Button>
          <Button variant="ghost" size="icon">
            <Share2 className="h-4 w-4" />
          </Button>
          {!isEditing && !article.is_deleted && (
            <Button variant="ghost" size="icon" onClick={startEditing}>
              <Edit2 className="h-4 w-4" />
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {article.is_deleted ? (
                <>
                  <DropdownMenuItem onClick={onRestore}>
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Restore
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onDelete} className="text-destructive">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Permanently
                  </DropdownMenuItem>
                </>
              ) : (
                <DropdownMenuItem onClick={onDelete} className="text-destructive">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Move to Trash
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Article content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-8">
          {/* Status and metadata */}
          <div className="flex items-center gap-3 mb-4">
            {isEditing ? (
              <Select value={editStatus} onValueChange={(v) => setEditStatus(v as ArticleStatus)}>
                <SelectTrigger className="w-32 h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <StatusBadge status={article.status} />
            )}
            {article.is_deleted && (
              <Badge variant="destructive" className="text-xs">In Trash</Badge>
            )}
          </div>

          {/* Title */}
          {isEditing ? (
            <Input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="text-3xl font-semibold border-0 px-0 focus-visible:ring-0 mb-4"
              placeholder="Untitled"
            />
          ) : (
            <h1 className="text-3xl font-semibold mb-4">{article.title}</h1>
          )}

          {/* Author and date */}
          <div className="flex items-center gap-3 text-sm text-muted-foreground mb-6">
            <span>Updated {timeAgo}</span>
          </div>

          {/* Collection selector (edit mode) */}
          {isEditing && (
            <div className="mb-4">
              <label className="text-sm font-medium mb-2 block">Collection</label>
              <Select
                value={editCollectionId || 'none'}
                onValueChange={(v) => setEditCollectionId(v === 'none' ? null : v)}
              >
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="No collection" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No collection</SelectItem>
                  {collections.map((collection) => (
                    <SelectItem key={collection.id} value={collection.id}>
                      {collection.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Tags */}
          <div className="flex flex-wrap gap-2 mb-6">
            {isEditing ? (
              <div className="w-full">
                <label className="text-sm font-medium mb-2 block">Tags</label>
                <TagInput
                  tags={editTags}
                  onChange={setEditTags}
                  existingTags={allTags}
                  placeholder="Add tags..."
                />
              </div>
            ) : (
              article.tags.map((tag, index) => (
                <Badge key={index} variant="outline" className="text-sm">
                  #{tag}
                </Badge>
              ))
            )}
          </div>

          {/* Content */}
          {isEditing ? (
            <Textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="min-h-[400px] resize-none border-0 px-0 focus-visible:ring-0"
              placeholder="Start writing..."
            />
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              {article.content ? (
                <div className="whitespace-pre-wrap">{article.content}</div>
              ) : (
                <p className="text-muted-foreground italic">No content yet</p>
              )}
            </div>
          )}

          {/* Edit mode actions */}
          {isEditing && (
            <div className="flex items-center gap-3 mt-8 pt-6 border-t">
              <Button onClick={handleSave}>Save Changes</Button>
              <Button variant="outline" onClick={handleCancel}>Cancel</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default DocumentView
