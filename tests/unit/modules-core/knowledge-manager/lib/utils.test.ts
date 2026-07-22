import { describe, it, expect } from 'vitest'
import {
  normalizeTag,
  normalizeTags,
  formatTagForDisplay,
  parseTagsFromString,
  getTagsWithCounts,
  filterArticlesByTag,
  searchArticles,
  sortArticlesByDate,
  truncateText,
  formatDate,
  formatDateTime,
} from '@/modules-core/knowledge-manager/lib/utils'
import type { KnowledgeArticle } from '@/modules-core/knowledge-manager/types'

// ---------------------------------------------------------------------------
// Test data helpers
// ---------------------------------------------------------------------------

function makeArticle(overrides: Partial<KnowledgeArticle> = {}): KnowledgeArticle {
  return {
    id: 'article-1',
    user_id: 'user-1',
    title: 'Test Article',
    content: 'Some content here',
    tags: [],
    collection_id: null,
    status: 'published',
    is_favorite: false,
    is_deleted: false,
    deleted_at: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// normalizeTag
// ---------------------------------------------------------------------------
describe('normalizeTag', () => {
  it('lowercases the tag', () => {
    expect(normalizeTag('JavaScript')).toBe('javascript')
  })

  it('trims whitespace', () => {
    expect(normalizeTag('  react  ')).toBe('react')
  })

  it('removes a leading # prefix', () => {
    expect(normalizeTag('#typescript')).toBe('typescript')
  })

  it('handles # prefix with whitespace', () => {
    expect(normalizeTag('  #Vue  ')).toBe('vue')
  })

  it('passes through already-normalized tags unchanged', () => {
    expect(normalizeTag('css')).toBe('css')
  })
})

// ---------------------------------------------------------------------------
// normalizeTags
// ---------------------------------------------------------------------------
describe('normalizeTags', () => {
  it('normalizes all tags in the array', () => {
    expect(normalizeTags(['JS', '#CSS', '  React  '])).toEqual(['js', 'css', 'react'])
  })

  it('removes duplicate tags', () => {
    expect(normalizeTags(['js', 'JS', '#js'])).toEqual(['js'])
  })

  it('removes empty strings', () => {
    expect(normalizeTags(['', '  ', 'go'])).toEqual(['go'])
  })

  it('returns empty array for empty input', () => {
    expect(normalizeTags([])).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// formatTagForDisplay
// ---------------------------------------------------------------------------
describe('formatTagForDisplay', () => {
  it('adds # prefix and normalizes', () => {
    expect(formatTagForDisplay('JavaScript')).toBe('#javascript')
  })

  it('does not double-prefix already prefixed tags', () => {
    expect(formatTagForDisplay('#react')).toBe('#react')
  })
})

// ---------------------------------------------------------------------------
// parseTagsFromString
// ---------------------------------------------------------------------------
describe('parseTagsFromString', () => {
  it('splits on commas and normalizes', () => {
    expect(parseTagsFromString('JS, React, CSS')).toEqual(['js', 'react', 'css'])
  })

  it('removes duplicates', () => {
    expect(parseTagsFromString('js, JS, js')).toEqual(['js'])
  })

  it('ignores empty segments', () => {
    expect(parseTagsFromString(',,js,')).toEqual(['js'])
  })

  it('returns empty array for empty string', () => {
    expect(parseTagsFromString('')).toEqual([])
  })

  it('handles # prefixes in input', () => {
    expect(parseTagsFromString('#vue, #react')).toEqual(['vue', 'react'])
  })
})

// ---------------------------------------------------------------------------
// getTagsWithCounts
// ---------------------------------------------------------------------------
describe('getTagsWithCounts', () => {
  it('counts tags across articles', () => {
    const articles = [
      makeArticle({ tags: ['js', 'css'] }),
      makeArticle({ id: '2', tags: ['js', 'python'] }),
    ]
    const result = getTagsWithCounts(articles)
    const jsEntry = result.find(t => t.name === 'js')
    expect(jsEntry?.count).toBe(2)
  })

  it('sorts by count descending', () => {
    const articles = [
      makeArticle({ tags: ['a', 'a', 'b'] }),
      makeArticle({ id: '2', tags: ['a'] }),
    ]
    // a appears in both articles (once each, so count per article not repeated), b once
    const result = getTagsWithCounts(articles)
    expect(result[0].count).toBeGreaterThanOrEqual(result[1]?.count ?? 0)
  })

  it('normalizes tags when counting', () => {
    const articles = [
      makeArticle({ tags: ['JS'] }),
      makeArticle({ id: '2', tags: ['js'] }),
    ]
    const result = getTagsWithCounts(articles)
    const jsEntry = result.find(t => t.name === 'js')
    expect(jsEntry?.count).toBe(2)
  })

  it('returns empty array for articles with no tags', () => {
    expect(getTagsWithCounts([makeArticle({ tags: [] })])).toEqual([])
  })

  it('handles articles with null/undefined tags gracefully', () => {
    // tags is typed as string[] but API data might be missing
    const article = makeArticle({ tags: undefined as unknown as string[] })
    expect(() => getTagsWithCounts([article])).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// filterArticlesByTag
// ---------------------------------------------------------------------------
describe('filterArticlesByTag', () => {
  it('returns articles that have the given tag', () => {
    const articles = [
      makeArticle({ id: '1', tags: ['js', 'css'] }),
      makeArticle({ id: '2', tags: ['python'] }),
    ]
    const result = filterArticlesByTag(articles, 'js')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('1')
  })

  it('is case-insensitive', () => {
    const articles = [makeArticle({ tags: ['JavaScript'] })]
    expect(filterArticlesByTag(articles, 'javascript')).toHaveLength(1)
    expect(filterArticlesByTag(articles, 'JAVASCRIPT')).toHaveLength(1)
  })

  it('returns empty array when no match', () => {
    const articles = [makeArticle({ tags: ['css'] })]
    expect(filterArticlesByTag(articles, 'python')).toHaveLength(0)
  })

  it('handles articles without tags', () => {
    const articles = [makeArticle({ tags: undefined as unknown as string[] })]
    expect(filterArticlesByTag(articles, 'js')).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// searchArticles
// ---------------------------------------------------------------------------
describe('searchArticles', () => {
  it('returns all articles for empty query', () => {
    const articles = [makeArticle(), makeArticle({ id: '2' })]
    expect(searchArticles(articles, '')).toHaveLength(2)
  })

  it('returns all articles for whitespace-only query', () => {
    const articles = [makeArticle()]
    expect(searchArticles(articles, '   ')).toHaveLength(1)
  })

  it('filters by title match (case-insensitive)', () => {
    const articles = [
      makeArticle({ id: '1', title: 'React Hooks' }),
      makeArticle({ id: '2', title: 'Svelte Guide' }),
    ]
    expect(searchArticles(articles, 'react')).toHaveLength(1)
    expect(searchArticles(articles, 'REACT')).toHaveLength(1)
  })

  it('filters by content match', () => {
    const articles = [
      makeArticle({ id: '1', title: 'Article A', content: 'useEffect and useState' }),
      makeArticle({ id: '2', title: 'Article B', content: 'vanilla js' }),
    ]
    expect(searchArticles(articles, 'useeffect')).toHaveLength(1)
  })

  it('returns empty array when nothing matches', () => {
    const articles = [makeArticle({ title: 'React', content: 'hooks' })]
    expect(searchArticles(articles, 'vue')).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// sortArticlesByDate
// ---------------------------------------------------------------------------
describe('sortArticlesByDate', () => {
  const older = makeArticle({ id: '1', updated_at: '2024-01-01T00:00:00Z', created_at: '2024-01-01T00:00:00Z' })
  const newer = makeArticle({ id: '2', updated_at: '2024-06-01T00:00:00Z', created_at: '2024-06-01T00:00:00Z' })

  it('sorts newest first by default (descending)', () => {
    const result = sortArticlesByDate([older, newer])
    expect(result[0].id).toBe('2')
    expect(result[1].id).toBe('1')
  })

  it('sorts oldest first when ascending=true', () => {
    const result = sortArticlesByDate([newer, older], true)
    expect(result[0].id).toBe('1')
    expect(result[1].id).toBe('2')
  })

  it('does not mutate the original array', () => {
    const original = [older, newer]
    sortArticlesByDate(original)
    expect(original[0].id).toBe('1')
  })

  it('falls back to created_at when updated_at is absent', () => {
    const a = makeArticle({ id: 'a', updated_at: undefined as unknown as string, created_at: '2024-03-01T00:00:00Z' })
    const b = makeArticle({ id: 'b', updated_at: undefined as unknown as string, created_at: '2024-01-01T00:00:00Z' })
    const result = sortArticlesByDate([b, a])
    expect(result[0].id).toBe('a')
  })
})

// ---------------------------------------------------------------------------
// truncateText
// ---------------------------------------------------------------------------
describe('truncateText', () => {
  it('returns the text unchanged when within maxLength', () => {
    expect(truncateText('hello', 10)).toBe('hello')
    expect(truncateText('hello', 5)).toBe('hello')
  })

  it('truncates and adds ellipsis when text exceeds maxLength', () => {
    const result = truncateText('Hello World', 5)
    expect(result).toContain('...')
    expect(result.length).toBeLessThanOrEqual(8) // 5 + 3 for '...'
  })

  it('returns empty string for empty input', () => {
    expect(truncateText('', 10)).toBe('')
  })
})

// ---------------------------------------------------------------------------
// formatDate / formatDateTime
// ---------------------------------------------------------------------------
describe('formatDate', () => {
  it('returns a non-empty string for a valid ISO date', () => {
    const result = formatDate('2025-06-15T12:00:00Z')
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('includes the year in the output', () => {
    expect(formatDate('2025-06-15T12:00:00Z')).toContain('2025')
  })
})

describe('formatDateTime', () => {
  it('returns a non-empty string for a valid ISO date-time', () => {
    const result = formatDateTime('2025-06-15T14:30:00Z')
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('includes the year in the output', () => {
    expect(formatDateTime('2025-06-15T14:30:00Z')).toContain('2025')
  })
})
