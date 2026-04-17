'use client'

import { useState, useEffect } from 'react'
import { ChevronRight, Star, Share2, Edit2, Trash2, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
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
  onCreateNew?: () => void
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
  onRestore,
  onCreateNew
}: DocumentViewProps) {
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const [editTags, setEditTags] = useState<string[]>([])
  const [editStatus, setEditStatus] = useState<ArticleStatus>('draft')
  const [editCollectionId, setEditCollectionId] = useState<string | null>(null)

  // Sync edit state when article changes while in edit mode
  useEffect(() => {
    if (isEditing && article) {
      setEditTitle(article.title)
      setEditContent(article.content)
      setEditTags(article.tags)
      setEditStatus(article.status)
      setEditCollectionId(article.collection_id)
    }
  }, [article?.id, isEditing])

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
      <div className="flex-1 flex flex-col overflow-hidden bg-muted/30">
        <div className="flex items-center justify-end px-6 py-3 border-b">
          {onCreateNew && (
            <Button size="sm" onClick={onCreateNew} className="text-white" style={{ backgroundColor: 'hsl(var(--accent))', fontSize: '0.80rem', fontWeight: 500 }}>
              NEW DOCUMENT
            </Button>
          )}
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <p className="text-lg font-medium">No document selected</p>
            <p className="text-sm mt-1">Select a document from the list to view its contents</p>
          </div>
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
          <span className="text-sm text-muted-foreground mr-1">Updated {timeAgo}</span>
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleFavorite}
            className={article.is_favorite ? 'text-amber-500' : ''}
          >
            <Star className="h-4 w-4" fill={article.is_favorite ? 'currentColor' : 'none'} />
          </Button>
          {!article.is_deleted && (
            <Button variant="ghost" size="icon" onClick={isEditing ? handleCancel : startEditing}>
              <Edit2 className="h-4 w-4" />
            </Button>
          )}
          {article.is_deleted && onRestore ? (
            <Button variant="ghost" size="icon" onClick={onRestore}>
              <RotateCcw className="h-4 w-4" />
            </Button>
          ) : null}
          <Button variant="ghost" size="icon" onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
          {isEditing && (
            <>
              <Button size="sm" onClick={handleSave}>Save</Button>
              <Button size="sm" variant="outline" onClick={handleCancel}>Cancel</Button>
            </>
          )}
          {onCreateNew && (
            <Button size="sm" onClick={onCreateNew} className="text-white" style={{ backgroundColor: 'hsl(var(--accent))', fontSize: '0.80rem', fontWeight: 500 }}>
              NEW DOCUMENT
            </Button>
          )}
        </div>
      </div>

      {/* Article content */}
      <div className="flex-1 overflow-y-auto flex flex-col">
        <div className="max-w-3xl mx-auto px-6 py-8 flex-1 flex flex-col w-full">
          {/* Title */}
          {isEditing ? (
            <Input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="!text-4xl !font-semibold border-0 px-0 focus-visible:ring-0 mb-4 h-auto"
              placeholder="Title"
            />
          ) : (
            <h1 className="text-4xl font-semibold mb-4" style={{ paddingTop: '6.75px', paddingBottom: '6.75px' }}>{article.title}</h1>
          )}

          {/* Content */}
          {isEditing ? (
            <Textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="flex-1 min-h-[200px] resize-none border-0 px-0 focus-visible:ring-0 text-lg"
              placeholder="Start writing..."
            />
          ) : (
            <div className="prose prose-base dark:prose-invert max-w-none flex-1">
              {article.content ? (
                <div className="whitespace-pre-wrap">{article.content}</div>
              ) : (
                <p className="text-muted-foreground italic">No content yet</p>
              )}
            </div>
          )}

          {/* Bottom metadata row: Status, Collection, Tags */}
          <div className="flex items-start gap-4 pt-6 mt-6 border-t">
            {isEditing ? (
              <Select value={editStatus} onValueChange={(v) => setEditStatus(v as ArticleStatus)}>
                <SelectTrigger className="w-36 h-8 text-sm">
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

            {isEditing ? (
              <Select
                value={editCollectionId || 'none'}
                onValueChange={(v) => setEditCollectionId(v === 'none' ? null : v)}
              >
                <SelectTrigger className="w-48 h-8 text-sm">
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
            ) : article.collection ? (
              <Badge variant="outline" className="text-base">{article.collection.name}</Badge>
            ) : null}

            <div className="flex flex-wrap gap-2 flex-1">
              {isEditing ? (
                <TagInput
                  tags={editTags}
                  onChange={setEditTags}
                  existingTags={allTags}
                  placeholder="Add tags..."
                />
              ) : (
                article.tags.map((tag, index) => (
                  <Badge key={index} variant="outline" className="text-base">
                    #{tag}
                  </Badge>
                ))
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

export default DocumentView
