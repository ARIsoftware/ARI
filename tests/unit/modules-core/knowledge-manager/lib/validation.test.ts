import { describe, it, expect } from 'vitest'
import {
  createCollectionSchema,
  updateCollectionSchema,
  collectionIdParamSchema,
  KnowledgeCollectionSchema,
  KnowledgeCollectionWithCountSchema,
  CollectionListResponseSchema,
  CollectionSingleResponseSchema,
  CollectionDeleteResponseSchema,
  createArticleSchema,
  updateArticleSchema,
  articleIdParamSchema,
  listArticlesQuerySchema,
  deleteArticleQuerySchema,
  KnowledgeArticleSchema,
  TagWithCountSchema,
  ArticleListResponseSchema,
  ArticleSingleResponseSchema,
  ArticleDeleteResponseSchema,
} from '@/modules-core/knowledge-manager/lib/validation'

const VALID_UUID = '123e4567-e89b-12d3-a456-426614174000'

// ─── createCollectionSchema ───────────────────────────────────────────────────

describe('createCollectionSchema', () => {
  it('accepts minimal valid collection', () => {
    expect(createCollectionSchema.safeParse({ name: 'My Collection' }).success).toBe(true)
  })

  it('uses default color #6b7280 when not provided', () => {
    const result = createCollectionSchema.parse({ name: 'Test' })
    expect(result.color).toBe('#6b7280')
  })

  it('uses default icon Folder when not provided', () => {
    const result = createCollectionSchema.parse({ name: 'Test' })
    expect(result.icon).toBe('Folder')
  })

  it('accepts custom color and icon', () => {
    expect(createCollectionSchema.safeParse({ name: 'C', color: '#ff0000', icon: 'Star' }).success).toBe(true)
  })

  it('rejects empty name', () => {
    expect(createCollectionSchema.safeParse({ name: '' }).success).toBe(false)
  })

  it('rejects name exceeding 100 chars', () => {
    expect(createCollectionSchema.safeParse({ name: 'a'.repeat(101) }).success).toBe(false)
  })

  it('accepts name at exactly 100 chars', () => {
    expect(createCollectionSchema.safeParse({ name: 'a'.repeat(100) }).success).toBe(true)
  })

  it('rejects name with < character (safeText)', () => {
    expect(createCollectionSchema.safeParse({ name: '<script>' }).success).toBe(false)
  })

  it('rejects name with > character (safeText)', () => {
    expect(createCollectionSchema.safeParse({ name: 'a>b' }).success).toBe(false)
  })

  it('rejects invalid hex color', () => {
    expect(createCollectionSchema.safeParse({ name: 'C', color: 'not-a-color' }).success).toBe(false)
  })

  it('rejects hex color without #', () => {
    expect(createCollectionSchema.safeParse({ name: 'C', color: 'ff0000' }).success).toBe(false)
  })

  it('accepts uppercase hex color', () => {
    expect(createCollectionSchema.safeParse({ name: 'C', color: '#FF0000' }).success).toBe(true)
  })

  it('rejects icon exceeding 50 chars (safeText)', () => {
    expect(createCollectionSchema.safeParse({ name: 'C', icon: 'a'.repeat(51) }).success).toBe(false)
  })
})

// ─── updateCollectionSchema ───────────────────────────────────────────────────

describe('updateCollectionSchema', () => {
  it('accepts empty object (all optional)', () => {
    expect(updateCollectionSchema.safeParse({}).success).toBe(true)
  })

  it('accepts name only', () => {
    expect(updateCollectionSchema.safeParse({ name: 'New Name' }).success).toBe(true)
  })

  it('accepts color only', () => {
    expect(updateCollectionSchema.safeParse({ color: '#abc123' }).success).toBe(true)
  })

  it('accepts sort_order 0', () => {
    expect(updateCollectionSchema.safeParse({ sort_order: 0 }).success).toBe(true)
  })

  it('rejects negative sort_order', () => {
    expect(updateCollectionSchema.safeParse({ sort_order: -1 }).success).toBe(false)
  })

  it('rejects non-integer sort_order', () => {
    expect(updateCollectionSchema.safeParse({ sort_order: 1.5 }).success).toBe(false)
  })

  it('rejects empty name', () => {
    expect(updateCollectionSchema.safeParse({ name: '' }).success).toBe(false)
  })

  it('rejects name with control chars', () => {
    expect(updateCollectionSchema.safeParse({ name: 'bad\x01name' }).success).toBe(false)
  })
})

// ─── collectionIdParamSchema ──────────────────────────────────────────────────

describe('collectionIdParamSchema', () => {
  it('accepts valid UUID', () => {
    expect(collectionIdParamSchema.safeParse({ id: VALID_UUID }).success).toBe(true)
  })

  it('rejects non-UUID', () => {
    expect(collectionIdParamSchema.safeParse({ id: 'bad' }).success).toBe(false)
  })
})

// ─── KnowledgeCollectionSchema ────────────────────────────────────────────────

describe('KnowledgeCollectionSchema', () => {
  const valid = {
    id: VALID_UUID,
    user_id: 'user1',
    name: 'My Collection',
    color: null,
    icon: null,
    sort_order: null,
    created_at: null,
    updated_at: null,
  }

  it('accepts valid collection', () => {
    expect(KnowledgeCollectionSchema.safeParse(valid).success).toBe(true)
  })

  it('accepts null sort_order', () => {
    expect(KnowledgeCollectionSchema.safeParse({ ...valid, sort_order: null }).success).toBe(true)
  })

  it('accepts integer sort_order', () => {
    expect(KnowledgeCollectionSchema.safeParse({ ...valid, sort_order: 5 }).success).toBe(true)
  })
})

// ─── KnowledgeCollectionWithCountSchema ───────────────────────────────────────

describe('KnowledgeCollectionWithCountSchema', () => {
  const valid = {
    id: VALID_UUID,
    user_id: 'u',
    name: 'C',
    color: null,
    icon: null,
    sort_order: null,
    created_at: null,
    updated_at: null,
    article_count: 3,
  }

  it('accepts valid collection with count', () => {
    expect(KnowledgeCollectionWithCountSchema.safeParse(valid).success).toBe(true)
  })

  it('rejects negative article_count', () => {
    expect(KnowledgeCollectionWithCountSchema.safeParse({ ...valid, article_count: -1 }).success).toBe(false)
  })
})

// ─── Collection response schemas ──────────────────────────────────────────────

describe('CollectionListResponseSchema', () => {
  it('accepts empty collections', () => {
    expect(CollectionListResponseSchema.safeParse({ collections: [] }).success).toBe(true)
  })
})

describe('CollectionSingleResponseSchema', () => {
  it('accepts valid collection', () => {
    const collection = {
      id: VALID_UUID,
      user_id: 'u',
      name: 'C',
      color: null,
      icon: null,
      sort_order: null,
      created_at: null,
      updated_at: null,
      article_count: 0,
    }
    expect(CollectionSingleResponseSchema.safeParse({ collection }).success).toBe(true)
  })
})

describe('CollectionDeleteResponseSchema', () => {
  it('accepts valid delete response', () => {
    expect(CollectionDeleteResponseSchema.safeParse({ success: true, message: 'Deleted' }).success).toBe(true)
  })

  it('rejects success: false', () => {
    expect(CollectionDeleteResponseSchema.safeParse({ success: false, message: 'Nope' }).success).toBe(false)
  })
})

// ─── createArticleSchema ──────────────────────────────────────────────────────

describe('createArticleSchema', () => {
  it('accepts minimal valid article (title only, rest use defaults)', () => {
    expect(createArticleSchema.safeParse({ title: 'Hello World' }).success).toBe(true)
  })

  it('defaults content to empty string', () => {
    const result = createArticleSchema.parse({ title: 'T' })
    expect(result.content).toBe('')
  })

  it('defaults tags to empty array', () => {
    const result = createArticleSchema.parse({ title: 'T' })
    expect(result.tags).toEqual([])
  })

  it('defaults status to "draft"', () => {
    const result = createArticleSchema.parse({ title: 'T' })
    expect(result.status).toBe('draft')
  })

  it('defaults is_favorite to false', () => {
    const result = createArticleSchema.parse({ title: 'T' })
    expect(result.is_favorite).toBe(false)
  })

  it('accepts status "published"', () => {
    expect(createArticleSchema.safeParse({ title: 'T', status: 'published' }).success).toBe(true)
  })

  it('rejects invalid status', () => {
    expect(createArticleSchema.safeParse({ title: 'T', status: 'archived' }).success).toBe(false)
  })

  it('rejects empty title', () => {
    expect(createArticleSchema.safeParse({ title: '' }).success).toBe(false)
  })

  it('rejects title exceeding 255 chars', () => {
    expect(createArticleSchema.safeParse({ title: 'a'.repeat(256) }).success).toBe(false)
  })

  it('rejects title with < character', () => {
    expect(createArticleSchema.safeParse({ title: '<bad>' }).success).toBe(false)
  })

  it('accepts content (markdown with > is allowed)', () => {
    expect(createArticleSchema.safeParse({ title: 'T', content: '> blockquote' }).success).toBe(true)
  })

  it('rejects content exceeding 1,000,000 chars', () => {
    expect(createArticleSchema.safeParse({ title: 'T', content: 'x'.repeat(1_000_001) }).success).toBe(false)
  })

  it('accepts tag with max 50 chars', () => {
    expect(createArticleSchema.safeParse({ title: 'T', tags: ['a'.repeat(50)] }).success).toBe(true)
  })

  it('rejects tag exceeding 50 chars', () => {
    expect(createArticleSchema.safeParse({ title: 'T', tags: ['a'.repeat(51)] }).success).toBe(false)
  })

  it('accepts valid UUID collection_id', () => {
    expect(createArticleSchema.safeParse({ title: 'T', collection_id: VALID_UUID }).success).toBe(true)
  })

  it('accepts null collection_id', () => {
    expect(createArticleSchema.safeParse({ title: 'T', collection_id: null }).success).toBe(true)
  })

  it('rejects non-UUID collection_id', () => {
    expect(createArticleSchema.safeParse({ title: 'T', collection_id: 'bad' }).success).toBe(false)
  })

  it('accepts is_favorite true', () => {
    expect(createArticleSchema.safeParse({ title: 'T', is_favorite: true }).success).toBe(true)
  })
})

// ─── updateArticleSchema ──────────────────────────────────────────────────────

describe('updateArticleSchema', () => {
  it('accepts empty object (all optional)', () => {
    expect(updateArticleSchema.safeParse({}).success).toBe(true)
  })

  it('accepts title update', () => {
    expect(updateArticleSchema.safeParse({ title: 'New Title' }).success).toBe(true)
  })

  it('rejects empty title when provided', () => {
    expect(updateArticleSchema.safeParse({ title: '' }).success).toBe(false)
  })

  it('accepts is_deleted boolean', () => {
    expect(updateArticleSchema.safeParse({ is_deleted: true }).success).toBe(true)
  })

  it('accepts status "published"', () => {
    expect(updateArticleSchema.safeParse({ status: 'published' }).success).toBe(true)
  })

  it('rejects invalid status', () => {
    expect(updateArticleSchema.safeParse({ status: 'archived' }).success).toBe(false)
  })
})

// ─── articleIdParamSchema ─────────────────────────────────────────────────────

describe('articleIdParamSchema', () => {
  it('accepts valid UUID', () => {
    expect(articleIdParamSchema.safeParse({ id: VALID_UUID }).success).toBe(true)
  })

  it('rejects non-UUID', () => {
    expect(articleIdParamSchema.safeParse({ id: 'bad' }).success).toBe(false)
  })
})

// ─── listArticlesQuerySchema ──────────────────────────────────────────────────

describe('listArticlesQuerySchema', () => {
  it('accepts empty object (all optional)', () => {
    expect(listArticlesQuerySchema.safeParse({}).success).toBe(true)
  })

  it('coerces limit string to number', () => {
    const result = listArticlesQuerySchema.parse({ limit: '20' })
    expect(result.limit).toBe(20)
  })

  it('rejects limit less than 1', () => {
    expect(listArticlesQuerySchema.safeParse({ limit: 0 }).success).toBe(false)
  })

  it('rejects limit greater than 500', () => {
    expect(listArticlesQuerySchema.safeParse({ limit: 501 }).success).toBe(false)
  })

  it('rejects negative offset', () => {
    expect(listArticlesQuerySchema.safeParse({ offset: -1 }).success).toBe(false)
  })

  it('accepts status "draft"', () => {
    expect(listArticlesQuerySchema.safeParse({ status: 'draft' }).success).toBe(true)
  })

  it('rejects invalid status', () => {
    expect(listArticlesQuerySchema.safeParse({ status: 'invalid' }).success).toBe(false)
  })

  it('accepts is_favorite "true"', () => {
    expect(listArticlesQuerySchema.safeParse({ is_favorite: 'true' }).success).toBe(true)
  })

  it('rejects is_favorite "yes"', () => {
    expect(listArticlesQuerySchema.safeParse({ is_favorite: 'yes' }).success).toBe(false)
  })

  it('accepts sort_by "title"', () => {
    expect(listArticlesQuerySchema.safeParse({ sort_by: 'title' }).success).toBe(true)
  })

  it('rejects invalid sort_by', () => {
    expect(listArticlesQuerySchema.safeParse({ sort_by: 'invalid' }).success).toBe(false)
  })

  it('accepts sort_dir "asc" and "desc"', () => {
    expect(listArticlesQuerySchema.safeParse({ sort_dir: 'asc' }).success).toBe(true)
    expect(listArticlesQuerySchema.safeParse({ sort_dir: 'desc' }).success).toBe(true)
  })

  it('rejects invalid sort_dir', () => {
    expect(listArticlesQuerySchema.safeParse({ sort_dir: 'ascending' }).success).toBe(false)
  })

  it('rejects search exceeding 200 chars', () => {
    expect(listArticlesQuerySchema.safeParse({ search: 'a'.repeat(201) }).success).toBe(false)
  })

  it('accepts count_only "true"', () => {
    expect(listArticlesQuerySchema.safeParse({ count_only: 'true' }).success).toBe(true)
  })

  it('accepts is_deleted "true"', () => {
    expect(listArticlesQuerySchema.safeParse({ is_deleted: 'true' }).success).toBe(true)
  })

  it('accepts valid UUID collection_id', () => {
    expect(listArticlesQuerySchema.safeParse({ collection_id: VALID_UUID }).success).toBe(true)
  })

  it('rejects non-UUID collection_id', () => {
    expect(listArticlesQuerySchema.safeParse({ collection_id: 'bad' }).success).toBe(false)
  })
})

// ─── deleteArticleQuerySchema ─────────────────────────────────────────────────

describe('deleteArticleQuerySchema', () => {
  it('accepts empty object', () => {
    expect(deleteArticleQuerySchema.safeParse({}).success).toBe(true)
  })

  it('accepts permanent "true"', () => {
    expect(deleteArticleQuerySchema.safeParse({ permanent: 'true' }).success).toBe(true)
  })

  it('accepts permanent "false"', () => {
    expect(deleteArticleQuerySchema.safeParse({ permanent: 'false' }).success).toBe(true)
  })

  it('rejects permanent "yes"', () => {
    expect(deleteArticleQuerySchema.safeParse({ permanent: 'yes' }).success).toBe(false)
  })
})

// ─── KnowledgeArticleSchema ───────────────────────────────────────────────────

describe('KnowledgeArticleSchema', () => {
  const valid = {
    id: VALID_UUID,
    user_id: 'user1',
    title: 'Hello',
    content: 'Content',
    tags: [],
    collection_id: null,
    status: 'draft',
    is_favorite: false,
    is_deleted: false,
    deleted_at: null,
    created_at: null,
    updated_at: null,
    collection: null,
  }

  it('accepts valid article', () => {
    expect(KnowledgeArticleSchema.safeParse(valid).success).toBe(true)
  })

  it('accepts article with collection reference', () => {
    const collection = { id: VALID_UUID, name: 'C', color: null, icon: null }
    expect(KnowledgeArticleSchema.safeParse({ ...valid, collection }).success).toBe(true)
  })
})

// ─── TagWithCountSchema ───────────────────────────────────────────────────────

describe('TagWithCountSchema', () => {
  it('accepts valid tag with count', () => {
    expect(TagWithCountSchema.safeParse({ name: 'react', count: 5 }).success).toBe(true)
  })

  it('rejects negative count', () => {
    expect(TagWithCountSchema.safeParse({ name: 'react', count: -1 }).success).toBe(false)
  })

  it('rejects non-integer count', () => {
    expect(TagWithCountSchema.safeParse({ name: 'react', count: 1.5 }).success).toBe(false)
  })
})

// ─── Response schemas ─────────────────────────────────────────────────────────

describe('ArticleListResponseSchema', () => {
  it('accepts valid list response', () => {
    expect(ArticleListResponseSchema.safeParse({ articles: [], count: 0, allTags: [] }).success).toBe(true)
  })

  it('rejects negative count', () => {
    expect(ArticleListResponseSchema.safeParse({ articles: [], count: -1, allTags: [] }).success).toBe(false)
  })
})

describe('ArticleSingleResponseSchema', () => {
  const article = {
    id: VALID_UUID,
    user_id: 'u',
    title: 'T',
    content: '',
    tags: [],
    collection_id: null,
    status: 'draft',
    is_favorite: false,
    is_deleted: false,
    deleted_at: null,
    created_at: null,
    updated_at: null,
    collection: null,
  }
  it('accepts valid article response', () => {
    expect(ArticleSingleResponseSchema.safeParse({ article }).success).toBe(true)
  })
})

describe('ArticleDeleteResponseSchema', () => {
  it('accepts valid delete response', () => {
    expect(ArticleDeleteResponseSchema.safeParse({ success: true, message: 'Deleted' }).success).toBe(true)
  })

  it('rejects success: false', () => {
    expect(ArticleDeleteResponseSchema.safeParse({ success: false, message: 'Nope' }).success).toBe(false)
  })
})
