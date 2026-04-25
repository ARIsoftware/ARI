'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAuth } from "@/components/providers"
import { Loader2 } from 'lucide-react'
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
import type {
  KnowledgeArticle,
  KnowledgeCollection,
  ArticleView,
  ArticleSortField,
  SortDirection,
  TagWithCount,
  NavigationCounts
} from '../types'

export default function KnowledgeManagerPage() {
  const { session } = useAuth()

  // Data state
  const [articles, setArticles] = useState<KnowledgeArticle[]>([])
  const [collections, setCollections] = useState<KnowledgeCollection[]>([])
  const [allTags, setAllTags] = useState<TagWithCount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // View state
  const [activeView, setActiveView] = useState<ArticleView>('all')
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null)
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [selectedArticle, setSelectedArticle] = useState<KnowledgeArticle | null>(null)
  const [isEditing, setIsEditing] = useState(false)

  // Filter/sort state
  const [searchQuery, setSearchQuery] = useState('')
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

  // Counts for navigation
  const [counts, setCounts] = useState<NavigationCounts>({
    all: 0,
    favorites: 0,
    trash: 0,
    recent: 0
  })

  // Load data
  const loadArticles = useCallback(async () => {
    if (!session?.access_token) return

    try {
      setLoading(true)
      const params = new URLSearchParams()

      if (searchQuery) params.set('search', searchQuery)
      if (activeTag) params.set('tag', activeTag)
      if (activeCollectionId) params.set('collection_id', activeCollectionId)
      if (activeView === 'favorites') params.set('is_favorite', 'true')
      if (activeView === 'trash') params.set('is_deleted', 'true')
      params.set('sort_by', sortBy)
      params.set('sort_dir', sortDir)

      const url = `/api/modules/knowledge-manager/data?${params}`
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      })

      if (!response.ok) throw new Error('Failed to load articles')

      const data = await response.json()
      setArticles(data.articles || [])
      setAllTags(data.allTags || [])

      // Update selected article if it changed
      if (selectedArticle) {
        const updated = data.articles?.find((a: KnowledgeArticle) => a.id === selectedArticle.id)
        if (updated) setSelectedArticle(updated)
      }
    } catch (err) {
      console.error('Error loading articles:', err)
      setError('Failed to load articles')
    } finally {
      setLoading(false)
    }
  }, [session, searchQuery, activeTag, activeCollectionId, activeView, sortBy, sortDir, selectedArticle])

  const loadCollections = useCallback(async () => {
    if (!session?.access_token) return

    try {
      const response = await fetch('/api/modules/knowledge-manager/collections', {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      })

      if (!response.ok) throw new Error('Failed to load collections')

      const data = await response.json()
      setCollections(data.collections || [])
    } catch (err) {
      console.error('Error loading collections:', err)
    }
  }, [session])

  const loadCounts = useCallback(async () => {
    if (!session?.access_token) return

    try {
      // Fetch all articles to calculate counts
      const [allRes, favRes, trashRes] = await Promise.all([
        fetch('/api/modules/knowledge-manager/data', {
          headers: { 'Authorization': `Bearer ${session.access_token}` }
        }),
        fetch('/api/modules/knowledge-manager/data?is_favorite=true', {
          headers: { 'Authorization': `Bearer ${session.access_token}` }
        }),
        fetch('/api/modules/knowledge-manager/data?is_deleted=true', {
          headers: { 'Authorization': `Bearer ${session.access_token}` }
        })
      ])

      const [allData, favData, trashData] = await Promise.all([
        allRes.json(),
        favRes.json(),
        trashRes.json()
      ])

      setCounts({
        all: allData.count || 0,
        favorites: favData.count || 0,
        trash: trashData.count || 0,
        recent: Math.min(allData.count || 0, 10) // Recent is just last 10
      })
    } catch (err) {
      console.error('Error loading counts:', err)
    }
  }, [session])

  useEffect(() => {
    if (session?.access_token) {
      loadArticles()
      loadCollections()
      loadCounts()
    }
  }, [session])

  useEffect(() => {
    if (session?.access_token) {
      const debounce = setTimeout(loadArticles, 300)
      return () => clearTimeout(debounce)
    }
  }, [searchQuery, activeTag, activeCollectionId, activeView, sortBy, sortDir])

  // Handlers
  const handleViewChange = (view: ArticleView, collectionId?: string | null, tag?: string | null) => {
    setActiveView(view)
    setActiveCollectionId(collectionId ?? null)
    setActiveTag(tag ?? null)
    setSelectedArticle(null)
    setIsEditing(false)
  }

  const handleSelectArticle = (article: KnowledgeArticle) => {
    setSelectedArticle(article)
    setIsEditing(false)
  }

  const handleToggleFavorite = async (article: KnowledgeArticle) => {
    if (!session?.access_token) return

    try {
      const response = await fetch(`/api/modules/knowledge-manager/data/${article.id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ is_favorite: !article.is_favorite })
      })

      if (!response.ok) throw new Error('Failed to update favorite')

      await loadArticles()
      await loadCounts()
    } catch (err) {
      console.error('Error toggling favorite:', err)
    }
  }

  const handleSaveArticle = async (updates: Partial<KnowledgeArticle>) => {
    if (!session?.access_token || !selectedArticle) return

    try {
      const response = await fetch(`/api/modules/knowledge-manager/data/${selectedArticle.id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updates)
      })

      if (!response.ok) throw new Error('Failed to save article')

      setIsEditing(false)
      await loadArticles()
    } catch (err) {
      console.error('Error saving article:', err)
    }
  }

  const handleCreateArticle = async () => {
    if (!session?.access_token || !newArticleTitle.trim()) return

    try {
      const response = await fetch('/api/modules/knowledge-manager/data', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: newArticleTitle,
          collection_id: activeCollectionId
        })
      })

      if (!response.ok) throw new Error('Failed to create article')

      const data = await response.json()
      setShowNewArticle(false)
      setNewArticleTitle('')
      await loadArticles()
      await loadCounts()
      setSelectedArticle(data.article)
      setIsEditing(true)
    } catch (err) {
      console.error('Error creating article:', err)
    }
  }

  const handleDeleteArticle = async () => {
    if (!session?.access_token || !deleteArticleId) return

    try {
      const url = isPermanentDelete
        ? `/api/modules/knowledge-manager/data/${deleteArticleId}?permanent=true`
        : `/api/modules/knowledge-manager/data/${deleteArticleId}`

      const response = await fetch(url, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      })

      if (!response.ok) throw new Error('Failed to delete article')

      if (selectedArticle?.id === deleteArticleId) {
        setSelectedArticle(null)
      }
      setDeleteArticleId(null)
      setIsPermanentDelete(false)
      await loadArticles()
      await loadCounts()
    } catch (err) {
      console.error('Error deleting article:', err)
    }
  }

  const handleRestoreArticle = async () => {
    if (!session?.access_token || !selectedArticle) return

    try {
      const response = await fetch(`/api/modules/knowledge-manager/data/${selectedArticle.id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ is_deleted: false })
      })

      if (!response.ok) throw new Error('Failed to restore article')

      setSelectedArticle(null)
      await loadArticles()
      await loadCounts()
    } catch (err) {
      console.error('Error restoring article:', err)
    }
  }

  const handleCreateCollection = async () => {
    if (!session?.access_token || !collectionName.trim()) return

    try {
      const response = await fetch('/api/modules/knowledge-manager/collections', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: collectionName,
          color: collectionColor
        })
      })

      if (!response.ok) throw new Error('Failed to create collection')

      setShowNewCollection(false)
      setCollectionName('')
      setCollectionColor('#6b7280')
      await loadCollections()
    } catch (err) {
      console.error('Error creating collection:', err)
    }
  }

  const handleUpdateCollection = async () => {
    if (!session?.access_token || !editingCollection) return

    try {
      const response = await fetch(`/api/modules/knowledge-manager/collections/${editingCollection.id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: collectionName,
          color: collectionColor
        })
      })

      if (!response.ok) throw new Error('Failed to update collection')

      setEditingCollection(null)
      setCollectionName('')
      setCollectionColor('#6b7280')
      await loadCollections()
      await loadArticles()
    } catch (err) {
      console.error('Error updating collection:', err)
    }
  }

  const handleDeleteCollection = async () => {
    if (!session?.access_token || !deleteCollectionId) return

    try {
      const response = await fetch(`/api/modules/knowledge-manager/collections/${deleteCollectionId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      })

      if (!response.ok) throw new Error('Failed to delete collection')

      if (activeCollectionId === deleteCollectionId) {
        setActiveCollectionId(null)
        setActiveView('all')
      }
      setDeleteCollectionId(null)
      await loadCollections()
      await loadArticles()
    } catch (err) {
      console.error('Error deleting collection:', err)
    }
  }

  const openEditCollection = (collection: KnowledgeCollection) => {
    setEditingCollection(collection)
    setCollectionName(collection.name)
    setCollectionColor(collection.color)
  }

  if (!session) {
    return null
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
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
          onCreateNew={() => setShowNewArticle(true)}
          loading={loading}
        />
      </div>

      {/* Center Panel - Document View */}
      <DocumentView
        article={selectedArticle}
        collections={collections}
        allTags={allTags.map(t => t.name)}
        isEditing={isEditing}
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
        onCreateNew={() => setShowNewArticle(true)}
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

      {/* New Article Dialog */}
      <Dialog open={showNewArticle} onOpenChange={setShowNewArticle}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Document</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                value={newArticleTitle}
                onChange={(e) => setNewArticleTitle(e.target.value)}
                placeholder="Document title..."
                onKeyDown={(e) => e.key === 'Enter' && handleCreateArticle()}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewArticle(false)}>Cancel</Button>
            <Button onClick={handleCreateArticle} disabled={!newArticleTitle.trim()}>Create</Button>
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
              <Label>Name</Label>
              <Input
                value={collectionName}
                onChange={(e) => setCollectionName(e.target.value)}
                placeholder="Collection name..."
              />
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={collectionColor}
                  onChange={(e) => setCollectionColor(e.target.value)}
                  className="w-10 h-10 rounded border cursor-pointer"
                />
                <Input
                  value={collectionColor}
                  onChange={(e) => setCollectionColor(e.target.value)}
                  placeholder="#6b7280"
                  className="w-28"
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
              disabled={!collectionName.trim()}
            >
              {editingCollection ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Article Confirmation */}
      <AlertDialog open={!!deleteArticleId} onOpenChange={() => setDeleteArticleId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isPermanentDelete ? 'Delete Permanently?' : 'Move to Trash?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isPermanentDelete
                ? 'This action cannot be undone. The document will be permanently deleted.'
                : 'The document will be moved to trash. You can restore it later.'}
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
              The collection will be deleted. Documents in this collection will not be deleted,
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
