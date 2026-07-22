/**
 * serialize.ts only exports one function: serializeImport().
 * It receives a Drizzle row and returns a wire-format HealthImportStatus.
 * We construct plain objects that match the inferred row shape — no DB needed.
 */
import { describe, it, expect, vi } from 'vitest'

// The module imports `healthDataImports` from '@/lib/db/schema' only as a
// type reference (import type). The import of '../types' is also type-only.
// Neither pulls in database code at runtime, so the module loads cleanly.
import { serializeImport } from '@/modules-core/health-data/lib/serialize'

/** Minimal row shape matching healthDataImports.$inferSelect */
function makeRow(overrides: Partial<{
  id: string
  userId: string
  status: string
  progress: number
  phase: string | null
  recordsParsed: number | bigint
  error: string | null
  exportDate: string | null
  locale: string | null
  profile: unknown
  clinical: unknown
  expiresAt: string
  createdAt: string
  updatedAt: string
}> = {}) {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    userId: 'user-1',
    status: 'completed',
    progress: 100,
    phase: 'Done',
    recordsParsed: 12345,
    error: null,
    exportDate: '2024-01-15T20:30:00-05:00',
    locale: 'en_US',
    profile: null,
    clinical: null,
    expiresAt: '2026-07-20 18:00:00+00',
    createdAt: '2026-07-10 12:00:00+00',
    updatedAt: '2026-07-10 12:00:00+00',
    ...overrides,
  }
}

describe('serializeImport', () => {
  it('maps id through unchanged', () => {
    const row = makeRow()
    expect(serializeImport(row as any).id).toBe(row.id)
  })

  it('maps status through as cast', () => {
    const row = makeRow({ status: 'processing' })
    expect(serializeImport(row as any).status).toBe('processing')
  })

  it('maps progress through', () => {
    const row = makeRow({ progress: 57 })
    expect(serializeImport(row as any).progress).toBe(57)
  })

  it('maps phase through (including null)', () => {
    expect(serializeImport(makeRow({ phase: 'Parsing' }) as any).phase).toBe('Parsing')
    expect(serializeImport(makeRow({ phase: null }) as any).phase).toBeNull()
  })

  it('converts recordsParsed bigint to number', () => {
    const row = makeRow({ recordsParsed: 9999 })
    const result = serializeImport(row as any)
    expect(result.records_parsed).toBe(9999)
    expect(typeof result.records_parsed).toBe('number')
  })

  it('maps error (null and non-null)', () => {
    expect(serializeImport(makeRow({ error: null }) as any).error).toBeNull()
    expect(serializeImport(makeRow({ error: 'oops' }) as any).error).toBe('oops')
  })

  it('maps export_date through verbatim', () => {
    const row = makeRow({ exportDate: '2024-01-15T20:30:00-05:00' })
    expect(serializeImport(row as any).export_date).toBe('2024-01-15T20:30:00-05:00')
  })

  it('normalizes expires_at to ISO 8601', () => {
    // Postgres text format: "2026-07-20 18:00:00+00"
    const row = makeRow({ expiresAt: '2026-07-20 18:00:00+00' })
    const result = serializeImport(row as any)
    // Must be parseable as a Date and produce a valid ISO string
    expect(() => new Date(result.expires_at)).not.toThrow()
    expect(result.expires_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(new Date(result.expires_at).getFullYear()).toBe(2026)
  })

  it('normalizes created_at to ISO 8601', () => {
    const row = makeRow({ createdAt: '2026-07-10 12:00:00.123+00' })
    const result = serializeImport(row as any)
    expect(result.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(new Date(result.created_at).getFullYear()).toBe(2026)
  })

  it('does not include userId or profile or clinical in output', () => {
    const result = serializeImport(makeRow() as any) as any
    expect(result.userId).toBeUndefined()
    expect(result.user_id).toBeUndefined()
    expect(result.profile).toBeUndefined()
    expect(result.clinical).toBeUndefined()
  })

  it('handles export_date null', () => {
    const row = makeRow({ exportDate: null })
    expect(serializeImport(row as any).export_date).toBeNull()
  })
})
