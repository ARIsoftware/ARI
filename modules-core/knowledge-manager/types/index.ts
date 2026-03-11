/**
 * Knowledge Manager Module - Type Definitions
 *
 * This file contains TypeScript type definitions for the Knowledge Manager module.
 *
 * IMPORTANT: Keep types in sync with:
 * - Database schema (database/schema.sql)
 * - API responses (api routes)
 * - Component props (components)
 */

// =============================================================================
// Status Types
// =============================================================================

export type ArticleStatus = 'draft' | 'published'

// =============================================================================
// Collection Types
// =============================================================================

/**
 * KnowledgeCollection
 *
 * Represents a folder/collection for organizing articles
 */
export interface KnowledgeCollection {
  id: string
  user_id: string
  name: string
  color: string           // Hex color (e.g., "#6b7280")
  icon: string            // Lucide icon name
  sort_order: number
  created_at: string
  updated_at: string
  article_count?: number  // Computed field from API
}

export interface CreateCollectionRequest {
  name: string
  color?: string
  icon?: string
}

export interface UpdateCollectionRequest {
  name?: string
  color?: string
  icon?: string
  sort_order?: number
}

// =============================================================================
// Article Types
// =============================================================================

/**
 * KnowledgeArticle
 *
 * Represents a row in the knowledge_articles table
 * Maps directly to database schema
 */
export interface KnowledgeArticle {
  id: string
  user_id: string
  title: string
  content: string
  tags: string[]
  collection_id: string | null
  status: ArticleStatus
  is_favorite: boolean
  is_deleted: boolean
  deleted_at: string | null
  created_at: string
  updated_at: string
  // Joined data
  collection?: KnowledgeCollection
}

/**
 * CreateArticleRequest
 *
 * Request body for POST /api/modules/knowledge-manager/data
 */
export interface CreateArticleRequest {
  title: string
  content?: string
  tags?: string[]
  collection_id?: string | null
  status?: ArticleStatus
  is_favorite?: boolean
}

/**
 * UpdateArticleRequest
 *
 * Request body for PATCH /api/modules/knowledge-manager/data/[id]
 */
export interface UpdateArticleRequest {
  title?: string
  content?: string
  tags?: string[]
  collection_id?: string | null
  status?: ArticleStatus
  is_favorite?: boolean
  is_deleted?: boolean
}

// =============================================================================
// Filter & Sort Types
// =============================================================================

export type ArticleSortField = 'updated_at' | 'created_at' | 'title'
export type SortDirection = 'asc' | 'desc'

export type ArticleView = 'all' | 'recent' | 'favorites' | 'trash' | 'collection'

export interface ArticleFilters {
  search?: string
  tag?: string
  collection_id?: string
  status?: ArticleStatus
  is_favorite?: boolean
  is_deleted?: boolean
  sort_by?: ArticleSortField
  sort_dir?: SortDirection
}

// =============================================================================
// API Response Types
// =============================================================================

/**
 * GetArticlesResponse
 *
 * Response from GET /api/modules/knowledge-manager/data
 */
export interface GetArticlesResponse {
  articles: KnowledgeArticle[]
  count: number
  allTags: TagWithCount[]
}

/**
 * CreateArticleResponse
 *
 * Response from POST /api/modules/knowledge-manager/data
 */
export interface CreateArticleResponse {
  article: KnowledgeArticle
}

/**
 * UpdateArticleResponse
 *
 * Response from PATCH /api/modules/knowledge-manager/data/[id]
 */
export interface UpdateArticleResponse {
  article: KnowledgeArticle
}

/**
 * DeleteArticleResponse
 *
 * Response from DELETE /api/modules/knowledge-manager/data/[id]
 */
export interface DeleteArticleResponse {
  success: boolean
  message: string
}

/**
 * GetCollectionsResponse
 *
 * Response from GET /api/modules/knowledge-manager/collections
 */
export interface GetCollectionsResponse {
  collections: KnowledgeCollection[]
}

/**
 * API Error Response
 *
 * Standard error response format for all module APIs
 */
export interface ApiErrorResponse {
  error: string
  details?: unknown
}

// =============================================================================
// UI Helper Types
// =============================================================================

/**
 * Tag with count for display purposes
 */
export interface TagWithCount {
  name: string
  count: number
}

/**
 * Navigation counts for sidebar
 */
export interface NavigationCounts {
  all: number
  favorites: number
  trash: number
  recent: number
}
