import { z } from 'zod'
import '@/lib/openapi/registry'

const uuidSchema = z.string().uuid()

export const createCollectionSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be less than 100 characters'),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be a valid hex color').default('#6b7280'),
  icon: z.string().max(50).default('Folder'),
}).openapi('CreateKnowledgeCollectionBody')

export const updateCollectionSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be less than 100 characters').optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be a valid hex color').optional(),
  icon: z.string().max(50).optional(),
  sort_order: z.number().int().min(0).optional(),
}).openapi('UpdateKnowledgeCollectionBody')

export const collectionIdParamSchema = z.object({
  id: uuidSchema,
})

export const KnowledgeCollectionSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string(),
  name: z.string(),
  color: z.string().nullable(),
  icon: z.string().nullable(),
  sort_order: z.number().int().nullable(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
}).openapi('KnowledgeCollection')

export const KnowledgeCollectionWithCountSchema = KnowledgeCollectionSchema.extend({
  article_count: z.number().int().nonnegative(),
}).openapi('KnowledgeCollectionWithCount')

export const CollectionListResponseSchema = z.object({
  collections: z.array(KnowledgeCollectionWithCountSchema),
}).openapi('KnowledgeCollectionListResponse')

export const CollectionSingleResponseSchema = z.object({
  collection: KnowledgeCollectionWithCountSchema,
}).openapi('KnowledgeCollectionSingleResponse')

export const CollectionDeleteResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
}).openapi('KnowledgeCollectionDeleteResponse')

// Articles

export const createArticleSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255, 'Title must be less than 255 characters'),
  content: z.string().default(''),
  tags: z.array(z.string().max(50)).default([]),
  collection_id: z.string().uuid().nullable().optional(),
  status: z.enum(['draft', 'published']).default('draft'),
  is_favorite: z.boolean().default(false),
}).openapi('CreateKnowledgeArticleBody')

export const updateArticleSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255, 'Title must be less than 255 characters').optional(),
  content: z.string().optional(),
  tags: z.array(z.string().max(50)).optional(),
  collection_id: z.string().uuid().nullable().optional(),
  status: z.enum(['draft', 'published']).optional(),
  is_favorite: z.boolean().optional(),
  is_deleted: z.boolean().optional(),
}).openapi('UpdateKnowledgeArticleBody')

export const articleIdParamSchema = z.object({
  id: uuidSchema,
})

export const listArticlesQuerySchema = z.object({
  search: z.string().optional(),
  tag: z.string().optional(),
  collection_id: z.string().uuid().optional(),
  status: z.enum(['draft', 'published']).optional(),
  is_favorite: z.enum(['true', 'false']).optional(),
  is_deleted: z.enum(['true', 'false']).optional(),
  sort_by: z.enum(['updated_at', 'created_at', 'title']).optional(),
  sort_dir: z.enum(['asc', 'desc']).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
})

export const deleteArticleQuerySchema = z.object({
  permanent: z.enum(['true', 'false']).optional(),
})

const ArticleCollectionRefSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  color: z.string().nullable(),
  icon: z.string().nullable(),
}).nullable()

export const KnowledgeArticleSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string(),
  title: z.string(),
  content: z.string(),
  tags: z.array(z.string()),
  collection_id: z.string().uuid().nullable(),
  status: z.string(),
  is_favorite: z.boolean(),
  is_deleted: z.boolean(),
  deleted_at: z.string().nullable(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
  collection: ArticleCollectionRefSchema,
}).openapi('KnowledgeArticle')

export const TagWithCountSchema = z.object({
  name: z.string(),
  count: z.number().int().nonnegative(),
}).openapi('KnowledgeTagWithCount')

export const ArticleListResponseSchema = z.object({
  articles: z.array(KnowledgeArticleSchema),
  count: z.number().int().nonnegative(),
  allTags: z.array(TagWithCountSchema),
}).openapi('KnowledgeArticleListResponse')

export const ArticleSingleResponseSchema = z.object({
  article: KnowledgeArticleSchema,
}).openapi('KnowledgeArticleSingleResponse')

export const ArticleDeleteResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
}).openapi('KnowledgeArticleDeleteResponse')
