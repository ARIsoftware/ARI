'use client'

import { useState } from 'react'
import { Plus, Search, Filter, ArrowUpDown, LayoutList, LayoutGrid } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { DocumentItem } from './document-item'
import type { KnowledgeArticle, ArticleSortField, SortDirection } from '../types'

interface DocumentListProps {
  articles: KnowledgeArticle[]
  selectedId: string | null
  searchQuery: string
  sortBy: ArticleSortField
  sortDir: SortDirection
  onSelect: (article: KnowledgeArticle) => void
  onSearch: (query: string) => void
  onSort: (field: ArticleSortField, dir: SortDirection) => void
  onToggleFavorite: (article: KnowledgeArticle) => void
  onCreateNew: () => void
  loading?: boolean
}

export function DocumentList({
  articles,
  selectedId,
  searchQuery,
  sortBy,
  sortDir,
  onSelect,
  onSearch,
  onSort,
  onToggleFavorite,
  onCreateNew,
  loading = false
}: DocumentListProps) {
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list')

  const getSortLabel = () => {
    const labels: Record<ArticleSortField, string> = {
      updated_at: 'Last Updated',
      created_at: 'Date Created',
      title: 'Title'
    }
    return labels[sortBy]
  }

  return (
    <div className="flex flex-col h-full border-r bg-background">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="text-lg font-semibold">Documents</h2>
        <Button size="icon" variant="ghost" onClick={onCreateNew}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Search */}
      <div className="p-3 border-b">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Filter documents..."
            value={searchQuery}
            onChange={(e) => onSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
      </div>

      {/* Filter & Sort Controls */}
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <div className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 text-xs">
                <Filter className="h-3 w-3 mr-1" />
                Filter
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem>All Documents</DropdownMenuItem>
              <DropdownMenuItem>Published</DropdownMenuItem>
              <DropdownMenuItem>Drafts</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 text-xs">
                <ArrowUpDown className="h-3 w-3 mr-1" />
                {getSortLabel()}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => onSort('updated_at', 'desc')}>
                Last Updated
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onSort('created_at', 'desc')}>
                Date Created
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onSort('title', 'asc')}>
                Title A-Z
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onSort('title', 'desc')}>
                Title Z-A
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant={viewMode === 'list' ? 'secondary' : 'ghost'}
            size="icon"
            className="h-8 w-8"
            onClick={() => setViewMode('list')}
          >
            <LayoutList className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
            size="icon"
            className="h-8 w-8"
            onClick={() => setViewMode('grid')}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Document List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="text-sm text-muted-foreground">Loading...</div>
          </div>
        ) : articles.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center p-4">
            <p className="text-sm text-muted-foreground">No documents found</p>
            <Button variant="link" size="sm" onClick={onCreateNew}>
              Create your first document
            </Button>
          </div>
        ) : (
          articles.map((article) => (
            <DocumentItem
              key={article.id}
              article={article}
              isSelected={selectedId === article.id}
              onSelect={() => onSelect(article)}
              onToggleFavorite={(e) => {
                e.stopPropagation()
                onToggleFavorite(article)
              }}
            />
          ))
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-2 border-t text-xs text-muted-foreground">
        <span>{articles.length} document{articles.length !== 1 ? 's' : ''}</span>
        <span>Last sync: just now</span>
      </div>
    </div>
  )
}

export default DocumentList
