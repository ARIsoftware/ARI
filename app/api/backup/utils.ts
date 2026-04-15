/**
 * Shared utilities for backup export, import, and verify routes.
 *
 * These routes all need access to the Supabase service client (for PostgREST
 * table/schema discovery via RPC) and share a common excluded-tables list.
 */

import { createClient } from "@supabase/supabase-js"
import crypto from "crypto"

/**
 * Create a Supabase service-role client for direct database access.
 * Used by export and verify for table discovery via RPC functions.
 */
export function getServiceSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseSecretKey) {
    throw new Error("Missing Supabase environment variables")
  }

  return createClient(supabaseUrl, supabaseSecretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
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
