'use client'

import { Star } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from './status-badge'
import { CollectionBadge } from './collection-badge'
import type { KnowledgeArticle } from '../types'
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

interface DocumentItemProps {
  article: KnowledgeArticle
  isSelected: boolean
  onSelect: () => void
  onToggleFavorite: (e: React.MouseEvent) => void
}

export function DocumentItem({
  article,
  isSelected,
  onSelect,
  onToggleFavorite
}: DocumentItemProps) {
  const truncateText = (text: string, maxLength: number) => {
    if (text.length <= maxLength) return text
    return text.slice(0, maxLength).trim() + '...'
  }

  const timeAgo = safeFormatDistanceToNow(article.updated_at)

  return (
    <div
      className={`
        p-3 border-b cursor-pointer transition-colors
        ${isSelected
          ? 'bg-muted border-l-2 border-l-primary'
          : 'hover:bg-muted/50 border-l-2 border-l-transparent'
        }
      `}
      onClick={onSelect}
    >
      {/* Title row with favorite */}
      <div className="flex items-start gap-2">
        <button
          onClick={onToggleFavorite}
          className={`
            mt-0.5 shrink-0 transition-colors
            ${article.is_favorite
              ? 'text-amber-500'
              : 'text-muted-foreground/30 hover:text-amber-500'
            }
          `}
        >
          <Star className="h-4 w-4" fill={article.is_favorite ? 'currentColor' : 'none'} />
        </button>
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-sm leading-tight line-clamp-1">
            {article.title}
          </h3>
        </div>
      </div>

      {/* Description preview */}
      {article.content && (
        <p className="text-xs text-muted-foreground mt-1 line-clamp-2 ml-6">
          {truncateText(article.content.replace(/[#*`]/g, ''), 120)}
        </p>
      )}

      {/* Badges row */}
      <div className="flex flex-wrap items-center gap-1.5 mt-2 ml-6">
        <StatusBadge status={article.status} size="sm" />

        {article.collection && (
          <CollectionBadge
            name={article.collection.name}
            color={article.collection.color}
            size="sm"
          />
        )}

        {article.tags.slice(0, 3).map((tag, index) => (
          <Badge
            key={index}
            variant="outline"
            className="text-[10px] px-1.5 py-0 text-muted-foreground"
          >
            {tag}
          </Badge>
        ))}
        {article.tags.length > 3 && (
          <span className="text-[10px] text-muted-foreground">
            +{article.tags.length - 3}
          </span>
        )}
      </div>

      {/* Timestamp */}
      <div className="text-[10px] text-muted-foreground mt-2 ml-6">
        Updated {timeAgo}
      </div>
    </div>
  )
}

export default DocumentItem
