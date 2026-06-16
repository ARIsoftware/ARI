/**
 * Knowledge Manager Module - TanStack Query Hooks
 *
 * Centralizes all data fetching/mutation for the module. Provides:
 * - Automatic caching + request deduplication
 * - Optimistic updates (instant UI) with rollback on error
 * - Background revalidation via cache invalidation
 * - Destructive toasts on mutation failure (so callers stay lean)
 *
 * Usage:
 *   import { useArticles, useUpdateArticle } from '@/modules/knowledge-manager/hooks/use-knowledge-manager'
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useToast } from '@/hooks/use-toast'
import type {
  KnowledgeArticle,
  KnowledgeCollection,
  GetArticlesResponse,
  NavigationCounts,
  ArticleView,
  ArticleSortField,
  SortDirection,
  UpdateArticleRequest,
} from '../types'

const BASE = '/api/modules/knowledge-manager'

// ─── Query keys ──────────────────────────────────────────────────────────
// Hierarchical so a single invalidate({ queryKey: knowledgeKeys.articles() })
// matches every cached article list regardless of its filter object.
export const knowledgeKeys = {
  all: ['knowledge-manager'] as const,
  articles: () => [...knowledgeKeys.all, 'articles'] as const,
  articleList: (params: ArticleQueryParams) => [...knowledgeKeys.articles(), params] as const,
  collections: () => [...knowledgeKeys.all, 'collections'] as const,
  counts: () => [...knowledgeKeys.all, 'counts'] as const,
}

export interface ArticleQueryParams {
  search?: string
  tag?: string | null
  collectionId?: string | null
  view: ArticleView
  sortBy: ArticleSortField
  sortDir: SortDirection
}

function buildArticleQuery(params: ArticleQueryParams): string {
  const sp = new URLSearchParams()
  if (params.search) sp.set('search', params.search)
  if (params.tag) sp.set('tag', params.tag)
  if (params.collectionId) sp.set('collection_id', params.collectionId)
  if (params.view === 'favorites') sp.set('is_favorite', 'true')
  if (params.view === 'trash') sp.set('is_deleted', 'true')
  sp.set('sort_by', params.sortBy)
  sp.set('sort_dir', params.sortDir)
  return sp.toString()
}

// Better Auth uses HTTP-only cookies — sent automatically with same-origin
// fetch. No Authorization header needed.
async function fetchJson(url: string, init?: RequestInit) {
  const res = await fetch(url, init)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || 'Request failed')
  }
  return res.json()
}

// ─── Queries ─────────────────────────────────────────────────────────────

export function useArticles(params: ArticleQueryParams) {
  return useQuery({
    queryKey: knowledgeKeys.articleList(params),
    queryFn: async (): Promise<GetArticlesResponse> => {
      const data = await fetchJson(`${BASE}/data?${buildArticleQuery(params)}`)
      return {
        articles: data.articles || [],
        count: data.count || 0,
        allTags: data.allTags || [],
      }
    },
  })
}

export function useCollections() {
  return useQuery({
    queryKey: knowledgeKeys.collections(),
    queryFn: async (): Promise<KnowledgeCollection[]> => {
      const data = await fetchJson(`${BASE}/collections`)
      return data.collections || []
    },
  })
}

export function useCounts() {
  return useQuery({
    queryKey: knowledgeKeys.counts(),
    queryFn: async (): Promise<NavigationCounts> => {
      // count_only skips the row fetch + join + tag aggregation — just the total.
      const [all, fav, trash] = await Promise.all([
        fetchJson(`${BASE}/data?count_only=true`),
        fetchJson(`${BASE}/data?count_only=true&is_favorite=true`),
        fetchJson(`${BASE}/data?count_only=true&is_deleted=true`),
      ])
      const total = all.count || 0
      return {
        all: total,
        favorites: fav.count || 0,
        trash: trash.count || 0,
        recent: Math.min(total, 10),
      }
    },
  })
}

// ─── Article mutations ───────────────────────────────────────────────────

export function useCreateArticle() {
  const qc = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: async (input: { title: string; collection_id?: string | null }): Promise<KnowledgeArticle> => {
      const data = await fetchJson(`${BASE}/data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      return data.article
    },
    // No optimistic insert: the caller needs the server-generated row (id) to
    // select + enter edit mode, so we just revalidate after.
    onError: () => {
      toast({ title: 'Could not create document', description: 'Please try again.', variant: 'destructive' })
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: knowledgeKeys.articles() })
      qc.invalidateQueries({ queryKey: knowledgeKeys.counts() })
    },
  })
}

export function useUpdateArticle() {
  const qc = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: UpdateArticleRequest }): Promise<KnowledgeArticle> => {
      const data = await fetchJson(`${BASE}/data/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      return data.article
    },
    onMutate: async ({ id, updates }) => {
      await qc.cancelQueries({ queryKey: knowledgeKeys.articles() })
      const previous = qc.getQueriesData<GetArticlesResponse>({ queryKey: knowledgeKeys.articles() })
      // Patch the article in-place across every cached list for instant feedback
      // (e.g. favorite star). List membership reconciles on the onSettled refetch.
      qc.setQueriesData<GetArticlesResponse>({ queryKey: knowledgeKeys.articles() }, (old) => {
        if (!old) return old
        return {
          ...old,
          articles: old.articles.map((a) => (a.id === id ? { ...a, ...updates } as KnowledgeArticle : a)),
        }
      })
      return { previous }
    },
    onError: (_err, _vars, context) => {
      context?.previous?.forEach(([key, data]) => qc.setQueryData(key, data))
      toast({ title: 'Could not save changes', description: 'Your changes were not saved.', variant: 'destructive' })
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: knowledgeKeys.articles() })
      qc.invalidateQueries({ queryKey: knowledgeKeys.counts() })
    },
  })
}

export function useDeleteArticle() {
  const qc = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: async ({ id, permanent }: { id: string; permanent?: boolean }): Promise<void> => {
      const url = permanent ? `${BASE}/data/${id}?permanent=true` : `${BASE}/data/${id}`
      await fetchJson(url, { method: 'DELETE' })
    },
    onMutate: async ({ id }) => {
      await qc.cancelQueries({ queryKey: knowledgeKeys.articles() })
      const previous = qc.getQueriesData<GetArticlesResponse>({ queryKey: knowledgeKeys.articles() })
      qc.setQueriesData<GetArticlesResponse>({ queryKey: knowledgeKeys.articles() }, (old) => {
        if (!old) return old
        return { ...old, articles: old.articles.filter((a) => a.id !== id) }
      })
      return { previous }
    },
    onError: (_err, _vars, context) => {
      context?.previous?.forEach(([key, data]) => qc.setQueryData(key, data))
      toast({ title: 'Could not delete document', description: 'Please try again.', variant: 'destructive' })
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: knowledgeKeys.articles() })
      qc.invalidateQueries({ queryKey: knowledgeKeys.counts() })
    },
  })
}

// ─── Collection mutations ────────────────────────────────────────────────

export function useCreateCollection() {
  const qc = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: async (input: { name: string; color: string }): Promise<KnowledgeCollection> => {
      const data = await fetchJson(`${BASE}/collections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      return data.collection
    },
    onError: () => {
      toast({ title: 'Could not create collection', description: 'Please try again.', variant: 'destructive' })
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: knowledgeKeys.collections() })
    },
  })
}

export function useUpdateCollection() {
  const qc = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: { name?: string; color?: string } }): Promise<KnowledgeCollection> => {
      const data = await fetchJson(`${BASE}/collections/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      return data.collection
    },
    onError: () => {
      toast({ title: 'Could not update collection', description: 'Please try again.', variant: 'destructive' })
    },
    onSettled: () => {
      // Articles carry the joined collection name/color, so refresh both.
      qc.invalidateQueries({ queryKey: knowledgeKeys.collections() })
      qc.invalidateQueries({ queryKey: knowledgeKeys.articles() })
    },
  })
}

export function useDeleteCollection() {
  const qc = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      await fetchJson(`${BASE}/collections/${id}`, { method: 'DELETE' })
    },
    onError: () => {
      toast({ title: 'Could not delete collection', description: 'Please try again.', variant: 'destructive' })
    },
    onSettled: () => {
      // Deleting a collection nulls collection_id on its articles (ON DELETE SET NULL).
      qc.invalidateQueries({ queryKey: knowledgeKeys.collections() })
      qc.invalidateQueries({ queryKey: knowledgeKeys.articles() })
    },
  })
}
