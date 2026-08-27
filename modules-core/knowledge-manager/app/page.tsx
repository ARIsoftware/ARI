'use client'

import { useEffect, useRef, useState } from 'react'
import { AlertCircle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
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
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DocumentList } from '../components/document-list'
import { DocumentView } from '../components/document-view'
import { SidebarNav } from '../components/sidebar-nav'
import {
  useArticles,
  useCollections,
  useCounts,
  useCreateArticle,
  useUpdateArticle,
  useDeleteArticle,
  useCreateCollection,
  useUpdateCollection,
  useDeleteCollection,
} from '../hooks/use-knowledge-manager'
import type {
  KnowledgeArticle,
  KnowledgeCollection,
  ArticleView,
  ArticleSortField,
  SortDirection,
  NavigationCounts,
} from '../types'
import styles from './scale.module.css'

const EMPTY_COUNTS: NavigationCounts = { all: 0, favorites: 0, trash: 0, recent: 0 }

export default function KnowledgeManagerPage() {
  // View state
  const [activeView, setActiveView] = useState<ArticleView>('all')
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null)
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [selectedArticle, setSelectedArticle] = useState<KnowledgeArticle | null>(null)
  const [isEditing, setIsEditing] = useState(false)

  // Filter/sort state. `searchQuery` drives the input; `debouncedSearch` feeds
  // the query so we don't fire a request on every keystroke.
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [sortBy, setSortBy] = useState<ArticleSortField>('updated_at')
  const [sortDir, setSortDir] = useState<SortDirection>('desc')

  // Dialog state
  const [showNewArticle, setShowNewArticle] = useState(false)
  const [showNewCollection, setShowNewCollection] = useState(false)
  const [editingCollection, setEditingCollection] = useState<KnowledgeCollection | null>(null)
  const [deleteArticleId, setDeleteArticleId] = useState<string | null>(null)
  const [deleteCollectionId, setDeleteCollectionId] = useState<string | null>(null)
  const [isPermanentDelete, setIsPermanentDelete] = useState(false)

  // Form state
  const [newArticleTitle, setNewArticleTitle] = useState('')
  const [collectionName, setCollectionName] = useState('')
  const [collectionColor, setCollectionColor] = useState('#6b7280')

  // Unsaved-changes guard (same pattern as the brainstorm module)
  const dirtyRef = useRef(false)
  const saveRef = useRef<(() => void) | null>(null)
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null)
  const pendingActionRef = useRef<(() => void) | null>(null)
  useEffect(() => { pendingActionRef.current = pendingAction }, [pendingAction])

  // Run `action` immediately, or ask about unsaved edits first
  const guardNav = (action: () => void) => {
    if (dirtyRef.current) setPendingAction(() => action)
    else action()
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
      setPendingAction(() => () => { window.location.href = href })
    }
    document.addEventListener('click', handler, true)
    return () => document.removeEventListener('click', handler, true)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 300)
    return () => clearTimeout(t)
  }, [searchQuery])

  // ─── Data ────────────────────────────────────────────────────────────
  const articlesQuery = useArticles({
    search: debouncedSearch,
    tag: activeTag,
    collectionId: activeCollectionId,
    view: activeView,
    sortBy,
    sortDir,
  })
  const collectionsQuery = useCollections()
  const countsQuery = useCounts()

  const articles = articlesQuery.data?.articles ?? []
  const allTags = articlesQuery.data?.allTags ?? []
  const collections = collectionsQuery.data ?? []
  const counts = countsQuery.data ?? EMPTY_COUNTS

  // Mutations
  const createArticle = useCreateArticle()
  const updateArticle = useUpdateArticle()
  const deleteArticle = useDeleteArticle()
  const createCollection = useCreateCollection()
  const updateCollection = useUpdateCollection()
  const deleteCollection = useDeleteCollection()

  // Keep the open article in sync with fresh list data (after edits/refetch).
  useEffect(() => {
    if (!selectedArticle) return
    const fresh = articles.find((a) => a.id === selectedArticle.id)
    if (fresh && fresh !== selectedArticle) setSelectedArticle(fresh)
  }, [articles]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Handlers ────────────────────────────────────────────────────────
  const handleViewChange = (view: ArticleView, collectionId?: string | null, tag?: string | null) => {
    guardNav(() => {
      setActiveView(view)
      setActiveCollectionId(collectionId ?? null)
      setActiveTag(tag ?? null)
      setSelectedArticle(null)
      setIsEditing(false)
    })
  }

  const handleSelectArticle = (article: KnowledgeArticle) => {
    guardNav(() => {
      setSelectedArticle(article)
      setIsEditing(false)
    })
  }

  const handleToggleFavorite = (article: KnowledgeArticle) => {
    updateArticle.mutate({ id: article.id, updates: { is_favorite: !article.is_favorite } })
  }

  const handleSaveArticle = (updates: Partial<KnowledgeArticle>) => {
    if (!selectedArticle) return
    updateArticle.mutate(
      { id: selectedArticle.id, updates },
      {
        onSuccess: () => {
          setIsEditing(false)
          dirtyRef.current = false
          // If save came from the unsaved-changes dialog, continue the blocked navigation
          const act = pendingActionRef.current
          pendingActionRef.current = null
          setPendingAction(null)
          act?.()
        },
        onError: () => setPendingAction(null),
      }
    )
  }

  const handleCreateArticle = () => {
    if (!newArticleTitle.trim() || createArticle.isPending) return
    createArticle.mutate(
      { title: newArticleTitle, collection_id: activeCollectionId },
      {
        onSuccess: (article) => {
          setShowNewArticle(false)
          setNewArticleTitle('')
          setSelectedArticle(article)
          setIsEditing(true)
        },
      }
    )
  }

  const handleDeleteArticle = () => {
    if (!deleteArticleId) return
    const id = deleteArticleId
    deleteArticle.mutate(
      { id, permanent: isPermanentDelete },
      {
        onSuccess: () => {
          if (selectedArticle?.id === id) setSelectedArticle(null)
          setDeleteArticleId(null)
          setIsPermanentDelete(false)
        },
      }
    )
  }

  const handleRestoreArticle = () => {
    if (!selectedArticle) return
    updateArticle.mutate(
      { id: selectedArticle.id, updates: { is_deleted: false } },
      { onSuccess: () => setSelectedArticle(null) }
    )
  }

  const handleCreateCollection = () => {
    if (!collectionName.trim() || createCollection.isPending) return
    createCollection.mutate(
      { name: collectionName, color: collectionColor },
      {
        onSuccess: () => {
          setShowNewCollection(false)
          setCollectionName('')
          setCollectionColor('#6b7280')
        },
      }
    )
  }

  const handleUpdateCollection = () => {
    if (!editingCollection || updateCollection.isPending) return
    updateCollection.mutate(
      { id: editingCollection.id, updates: { name: collectionName, color: collectionColor } },
      {
        onSuccess: () => {
          setEditingCollection(null)
          setCollectionName('')
          setCollectionColor('#6b7280')
        },
      }
    )
  }

  const handleDeleteCollection = () => {
    if (!deleteCollectionId) return
    const id = deleteCollectionId
    deleteCollection.mutate(id, {
      onSuccess: () => {
        if (activeCollectionId === id) {
          setActiveCollectionId(null)
          setActiveView('all')
        }
        setDeleteCollectionId(null)
      },
    })
  }

  const openEditCollection = (collection: KnowledgeCollection) => {
    setEditingCollection(collection)
    setCollectionName(collection.name)
    setCollectionColor(collection.color)
  }

  const savingCollection = createCollection.isPending || updateCollection.isPending

  return (
    <div className={`flex flex-col h-[calc(100vh-4rem)] overflow-hidden ${styles.scale}`}>
      {articlesQuery.isError && (
        <div className="flex items-center justify-between gap-3 border-b border-destructive/20 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          <span className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            Failed to load articles. Check your connection and try again.
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-destructive hover:text-destructive"
            onClick={() => articlesQuery.refetch()}
          >
            Retry
          </Button>
        </div>
      )}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel - Document List */}
        <div className="w-80 shrink-0">
          <DocumentList
            articles={articles}
            selectedId={selectedArticle?.id || null}
            searchQuery={searchQuery}
            sortBy={sortBy}
            sortDir={sortDir}
            onSelect={handleSelectArticle}
            onSearch={setSearchQuery}
            onSort={(field, dir) => { setSortBy(field); setSortDir(dir) }}
            onToggleFavorite={handleToggleFavorite}
            onCreateNew={() => guardNav(() => setShowNewArticle(true))}
            loading={articlesQuery.isLoading}
          />
        </div>

        {/* Center Panel - Document View */}
        <DocumentView
          article={selectedArticle}
          collections={collections}
          allTags={allTags.map(t => t.name)}
          isEditing={isEditing}
          isSaving={updateArticle.isPending}
          onToggleEdit={() => setIsEditing(!isEditing)}
          onSave={handleSaveArticle}
          onToggleFavorite={() => selectedArticle && handleToggleFavorite(selectedArticle)}
          onDelete={() => {
            if (selectedArticle) {
              setDeleteArticleId(selectedArticle.id)
              setIsPermanentDelete(selectedArticle.is_deleted)
            }
          }}
          onRestore={handleRestoreArticle}
          onCreateNew={() => guardNav(() => setShowNewArticle(true))}
          onDirtyChange={(d) => { dirtyRef.current = d }}
          registerSave={(fn) => { saveRef.current = fn }}
        />

        {/* Right Panel - Sidebar Navigation */}
        <SidebarNav
          activeView={activeView}
          activeCollectionId={activeCollectionId}
          activeTag={activeTag}
          collections={collections}
          tags={allTags}
          counts={counts}
          onViewChange={handleViewChange}
          onCreateCollection={() => setShowNewCollection(true)}
          onEditCollection={openEditCollection}
          onDeleteCollection={(id) => setDeleteCollectionId(id)}
        />
      </div>

      {/* New Article Dialog */}
      <Dialog open={showNewArticle} onOpenChange={setShowNewArticle}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Article</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="km-new-article-title">Title</Label>
              <Input
                id="km-new-article-title"
                value={newArticleTitle}
                onChange={(e) => setNewArticleTitle(e.target.value)}
                placeholder="Article title..."
                onKeyDown={(e) => e.key === 'Enter' && handleCreateArticle()}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewArticle(false)}>Cancel</Button>
            <Button onClick={handleCreateArticle} disabled={!newArticleTitle.trim() || createArticle.isPending}>
              {createArticle.isPending ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New/Edit Collection Dialog */}
      <Dialog
        open={showNewCollection || !!editingCollection}
        onOpenChange={(open) => {
          if (!open) {
            setShowNewCollection(false)
            setEditingCollection(null)
            setCollectionName('')
            setCollectionColor('#6b7280')
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCollection ? 'Edit Collection' : 'Create Collection'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="km-collection-name">Name</Label>
              <Input
                id="km-collection-name"
                value={collectionName}
                onChange={(e) => setCollectionName(e.target.value)}
                placeholder="Collection name..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="km-collection-color">Color</Label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  id="km-collection-color"
                  aria-label="Collection color"
                  value={collectionColor}
                  onChange={(e) => setCollectionColor(e.target.value)}
                  className="w-10 h-10 rounded border cursor-pointer"
                />
                <Input
                  value={collectionColor}
                  onChange={(e) => setCollectionColor(e.target.value)}
                  placeholder="#6b7280"
                  className="w-28"
                  aria-label="Collection color hex value"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowNewCollection(false)
              setEditingCollection(null)
            }}>Cancel</Button>
            <Button
              onClick={editingCollection ? handleUpdateCollection : handleCreateCollection}
              disabled={!collectionName.trim() || savingCollection}
            >
              {savingCollection ? 'Saving…' : editingCollection ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unsaved Changes Confirmation */}
      <AlertDialog open={pendingAction !== null} onOpenChange={(open) => { if (!open) setPendingAction(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes to this article. Save before leaving?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay</AlertDialogCancel>
            <Button
              variant="outline"
              onClick={() => {
                const act = pendingAction
                dirtyRef.current = false
                setIsEditing(false)
                setPendingAction(null)
                act?.()
              }}
            >
              Discard
            </Button>
            <AlertDialogAction
              disabled={updateArticle.isPending}
              onClick={(e) => {
                // Keep the dialog open until the save mutation settles
                e.preventDefault()
                saveRef.current?.()
              }}
            >
              {updateArticle.isPending ? 'Saving…' : 'Save'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Article Confirmation */}
      <AlertDialog open={!!deleteArticleId} onOpenChange={() => setDeleteArticleId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isPermanentDelete ? 'Delete Permanently?' : 'Move to Trash?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isPermanentDelete
                ? 'This action cannot be undone. The article will be permanently deleted.'
                : 'The article will be moved to trash. You can restore it later.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteArticle}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isPermanentDelete ? 'Delete Permanently' : 'Move to Trash'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Collection Confirmation */}
      <AlertDialog open={!!deleteCollectionId} onOpenChange={() => setDeleteCollectionId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Collection?</AlertDialogTitle>
            <AlertDialogDescription>
              The collection will be deleted. Articles in this collection will not be deleted,
              but they will no longer be assigned to any collection.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteCollection}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
