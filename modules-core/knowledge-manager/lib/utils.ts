/**
 * Knowledge Manager Module - Utility Functions
 *
 * Helper functions for working with knowledge articles and tags.
 */

import type { KnowledgeArticle } from '../types'

/**
 * Normalize a tag string
 * - Converts to lowercase
 * - Trims whitespace
 * - Removes # prefix if present
 */
export function normalizeTag(tag: string): string {
  return tag.toLowerCase().trim().replace(/^#/, '')
}

/**
 * Normalize an array of tags
 * - Normalizes each tag
 * - Removes duplicates
 * - Removes empty strings
 */
export function normalizeTags(tags: string[]): string[] {
  return [...new Set(tags.map(normalizeTag))].filter(tag => tag.length > 0)
}

/**
 * Format a tag for display (with # prefix)
 */
export function formatTagForDisplay(tag: string): string {
  return `#${normalizeTag(tag)}`
}

/**
 * Parse tags from a comma-separated string
 */
export function parseTagsFromString(input: string): string[] {
  return normalizeTags(
    input
      .split(',')
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0)
  )
}

/**
 * Get unique tags from an array of articles with their counts
 */
export function getTagsWithCounts(articles: KnowledgeArticle[]): { name: string; count: number }[] {
  const tagCounts = new Map<string, number>()

  for (const article of articles) {
    for (const tag of article.tags || []) {
      const normalizedTag = normalizeTag(tag)
      tagCounts.set(normalizedTag, (tagCounts.get(normalizedTag) || 0) + 1)
    }
  }

  return Array.from(tagCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
}

/**
 * Filter articles by tag
 */
export function filterArticlesByTag(
  articles: KnowledgeArticle[],
  tag: string
): KnowledgeArticle[] {
  const normalizedTag = normalizeTag(tag)
  return articles.filter(article =>
    article.tags?.some(t => normalizeTag(t) === normalizedTag)
  )
}

/**
 * Search articles by query (searches title and content)
 */
export function searchArticles(
  articles: KnowledgeArticle[],
  query: string
): KnowledgeArticle[] {
  const normalizedQuery = query.toLowerCase().trim()
  if (!normalizedQuery) return articles

  return articles.filter(article =>
    article.title.toLowerCase().includes(normalizedQuery) ||
    article.content.toLowerCase().includes(normalizedQuery)
  )
}

/**
 * Sort articles by date (newest first)
 */
export function sortArticlesByDate(
  articles: KnowledgeArticle[],
  ascending = false
): KnowledgeArticle[] {
  return [...articles].sort((a, b) => {
    const dateA = new Date(a.updated_at || a.created_at).getTime()
    const dateB = new Date(b.updated_at || b.created_at).getTime()
    return ascending ? dateA - dateB : dateB - dateA
  })
}

/**
 * Truncate text to a maximum length with ellipsis
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength).trim() + '...'
}

/**
 * Format a date for display
 */
export function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

/**
 * Format a date with time for display
 */
export function formatDateTime(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}
