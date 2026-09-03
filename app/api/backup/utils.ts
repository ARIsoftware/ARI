/**
 * Shared utilities for backup export, import, and verify routes.
 *
 * These routes use direct SQL via the pg pool for table/schema discovery.
 * No Supabase client dependency — works with any PostgreSQL backend.
 *
 * Pure backup logic (serialization, parsing, validation, DDL) lives in
 * lib/backup/ where it sits inside the unit-test coverage ratchet.
 */

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

// Canonical home is lib/backup/constants.ts (client-safe, coverage-tested);
// re-exported here for the routes that historically import from utils.
export { EXCLUDED_TABLES } from '@/lib/backup/constants'
