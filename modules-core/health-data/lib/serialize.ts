import type { healthDataImports } from '@/lib/db/schema'
import type { HealthImportStatus } from '../types'

type ImportRow = typeof healthDataImports.$inferSelect

/** Wire shape for an import row (omits profile/clinical payloads and user_id) */
export function serializeImport(row: ImportRow): HealthImportStatus {
  return {
    id: row.id,
    status: row.status as HealthImportStatus['status'],
    progress: row.progress,
    phase: row.phase,
    records_parsed: Number(row.recordsParsed),
    error: row.error,
    // export_date is parser-origin local time stored verbatim — pass through.
    export_date: row.exportDate,
    // expires_at/created_at are TIMESTAMPTZ read back in Postgres text format
    // ("2026-07-10 18:54:15.12+00"), which is not ISO 8601 — normalize so the
    // client can feed them to new Date() safely.
    expires_at: new Date(row.expiresAt).toISOString(),
    created_at: new Date(row.createdAt).toISOString(),
  }
}
