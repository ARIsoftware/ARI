'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Edit2, Trash2, Calendar } from 'lucide-react'
import type { KnowledgeArticle } from '../types'
import { formatDate, truncateText } from '../lib/utils'

interface ArticleCardProps {
  article: KnowledgeArticle
  onEdit: (article: KnowledgeArticle) => void
  onDelete: (id: string) => void
  onTagClick?: (tag: string) => void
}

export function ArticleCard({
  article,
  onEdit,
  onDelete,
  onTagClick
}: ArticleCardProps) {
  return (
    <Card className="group hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-lg font-medium line-clamp-2">
            {article.title}
          </CardTitle>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onEdit(article)}
              className="h-8 w-8 p-0"
            >
              <Edit2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(article.id)}
              className="h-8 w-8 p-0 text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {article.content && (
          <p className="text-sm text-muted-foreground line-clamp-3">
            {truncateText(article.content, 200)}
          </p>
        )}

        {article.tags && article.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {article.tags.map((tag, index) => (
              <Badge
                key={index}
                variant="outline"
                className="text-xs cursor-pointer hover:bg-accent"
                onClick={() => onTagClick?.(tag)}
              >
                #{tag}
              </Badge>
            ))}
          </div>
        )}

        <div className="flex items-center gap-1 text-xs text-muted-foreground pt-2 border-t">
          <Calendar className="h-3 w-3" />
          <span>Updated {formatDate(article.updated_at || article.created_at)}</span>
        </div>
      </CardContent>
    </Card>
  )
}

export default ArticleCard
