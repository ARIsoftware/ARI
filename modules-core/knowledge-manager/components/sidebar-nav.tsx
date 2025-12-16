'use client'

import { useState } from 'react'
import {
  Search,
  Home,
  FileText,
  Clock,
  Star,
  Trash2,
  FolderPlus,
  ChevronDown,
  ChevronRight,
  Hash,
  Plus,
  MoreHorizontal,
  Edit2
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { KnowledgeCollection, ArticleView, TagWithCount, NavigationCounts } from '../types'

interface SidebarNavProps {
  activeView: ArticleView
  activeCollectionId: string | null
  activeTag: string | null
  collections: KnowledgeCollection[]
  tags: TagWithCount[]
  counts: NavigationCounts
  onViewChange: (view: ArticleView, collectionId?: string | null, tag?: string | null) => void
  onCreateCollection: () => void
  onEditCollection: (collection: KnowledgeCollection) => void
  onDeleteCollection: (id: string) => void
}

export function SidebarNav({
  activeView,
  activeCollectionId,
  activeTag,
  collections,
  tags,
  counts,
  onViewChange,
  onCreateCollection,
  onEditCollection,
  onDeleteCollection
}: SidebarNavProps) {
  const [collectionsOpen, setCollectionsOpen] = useState(true)
  const [tagsOpen, setTagsOpen] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  const navItems = [
    { id: 'all' as const, label: 'All Documents', icon: FileText, count: counts.all },
    { id: 'recent' as const, label: 'Recent', icon: Clock, count: counts.recent },
    { id: 'favorites' as const, label: 'Favorites', icon: Star, count: counts.favorites },
    { id: 'trash' as const, label: 'Trash', icon: Trash2, count: counts.trash },
  ]

  // Filter tags by search
  const filteredTags = searchQuery
    ? tags.filter(t => t.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : tags

  return (
    <div className="w-72 flex flex-col h-full border-l bg-muted/30">
      {/* Search */}
      <div className="p-3 border-b">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 bg-background"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-6">
        {/* Navigation */}
        <nav className="space-y-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className={`
                w-full flex items-center justify-between px-3 py-2 rounded-md text-sm
                transition-colors
                ${activeView === item.id && !activeCollectionId && !activeTag
                  ? 'bg-muted font-medium'
                  : 'hover:bg-muted/50'
                }
              `}
            >
              <div className="flex items-center gap-3">
                <item.icon className="h-4 w-4" />
                <span>{item.label}</span>
              </div>
              <span className="text-xs text-muted-foreground">{item.count}</span>
            </button>
          ))}
        </nav>

        {/* Collections */}
        <Collapsible open={collectionsOpen} onOpenChange={setCollectionsOpen}>
          <div className="flex items-center justify-between">
            <CollapsibleTrigger asChild>
              <button className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground">
                {collectionsOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                Collections
              </button>
            </CollapsibleTrigger>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={onCreateCollection}
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>
          <CollapsibleContent className="mt-2 space-y-1">
            {collections.length === 0 ? (
              <p className="text-xs text-muted-foreground px-3 py-2">
                No collections yet
              </p>
            ) : (
              collections.map((collection) => (
                <div
                  key={collection.id}
                  className={`
                    group flex items-center justify-between px-3 py-2 rounded-md text-sm
                    transition-colors cursor-pointer
                    ${activeCollectionId === collection.id
                      ? 'bg-muted font-medium'
                      : 'hover:bg-muted/50'
                    }
                  `}
                  onClick={() => onViewChange('collection', collection.id)}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-3 h-3 rounded-sm"
                      style={{ backgroundColor: collection.color }}
                    />
                    <span className="truncate">{collection.name}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">
                      {collection.article_count || 0}
                    </span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreHorizontal className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onEditCollection(collection)}>
                          <Edit2 className="h-3 w-3 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => onDeleteCollection(collection.id)}
                          className="text-destructive"
                        >
                          <Trash2 className="h-3 w-3 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))
            )}
          </CollapsibleContent>
        </Collapsible>

        {/* Tags */}
        <Collapsible open={tagsOpen} onOpenChange={setTagsOpen}>
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground">
              {tagsOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              Tags
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 space-y-1">
            {filteredTags.length === 0 ? (
              <p className="text-xs text-muted-foreground px-3 py-2">
                {searchQuery ? 'No matching tags' : 'No tags yet'}
              </p>
            ) : (
              filteredTags.map((tag) => (
                <button
                  key={tag.name}
                  onClick={() => onViewChange('all', null, tag.name)}
                  className={`
                    w-full flex items-center justify-between px-3 py-2 rounded-md text-sm
                    transition-colors
                    ${activeTag === tag.name
                      ? 'bg-muted font-medium'
                      : 'hover:bg-muted/50'
                    }
                  `}
                >
                  <div className="flex items-center gap-3">
                    <Hash className="h-4 w-4 text-muted-foreground" />
                    <span>{tag.name}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{tag.count}</span>
                </button>
              ))
            )}
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  )
}

export default SidebarNav
