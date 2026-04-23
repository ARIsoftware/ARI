/**
 * Shared utilities for backup export, import, and verify routes.
 *
 * These routes use direct SQL via the pg pool for table/schema discovery.
 * No Supabase client dependency — works with any PostgreSQL backend.
 */

import crypto from "crypto"
import { pool } from "@/lib/db/pool"

/**
 * Execute a SQL query and return typed rows.
 * Uses the shared pg pool from lib/db/pool.ts.
 */
export async function queryRows<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
): Promise<T[]> {
  if (!pool) {
    throw new Error("Database pool not available — DATABASE_URL may not be set")
  }
  const result = await pool.query(sql, params)
  return result.rows as T[]
}

/** System/internal tables that should never appear in backups. */
export const EXCLUDED_TABLES = new Set([
  'spatial_ref_sys',
  'schema_migrations',
  'pg_stat_statements',
  'geography_columns',
  'geometry_columns',
])

/** SHA-256 checksum of JSON-serialized data. Used during export. */
export function calculateChecksum(data: any): string {
  const hash = crypto.createHash('sha256')
  hash.update(JSON.stringify(data))
  return hash.digest('hex')
}

/**
 * Strip NUL characters from a string. PostgreSQL rejects \u0000 in text
 * and JSONB columns, so any value containing NUL would produce a backup
 * that cannot be re-imported.
 */
export function stripNul(s: string): string {
  return s.replace(/\0/g, '')
}
