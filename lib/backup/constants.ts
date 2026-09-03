/**
 * Shared backup-system constants.
 *
 * Client-safe: no server-only imports, so the Settings UI and the API routes
 * can both import from here and stay in agreement.
 */

/**
 * Maximum accepted size for an uploaded backup file, enforced by BOTH the
 * Settings > Backups client (pre-upload check) and the import API route.
 * Export has no size limit, so import stays generous.
 */
export const MAX_BACKUP_FILE_BYTES = 200 * 1024 * 1024

/** Human-readable form of MAX_BACKUP_FILE_BYTES for error messages. */
export const MAX_BACKUP_FILE_LABEL = `${MAX_BACKUP_FILE_BYTES / (1024 * 1024)}MB`

/**
 * Tables that should never appear in backups.
 *
 * Two groups: PostGIS/system tables, and append-only telemetry. The telemetry
 * tables are request-rate driven and can dwarf real content, inflating every
 * backup and slowing the Backups screen's per-table COUNT(*) — and a restore
 * wants your data, not a replay of who called which endpoint.
 *
 * Import does NOT consult this list, so backups taken before a table was added
 * here still restore intact.
 *
 * Keep in sync with public.get_all_user_tables() in lib/db/setup.sql, which
 * applies the same exclusions server-side (enforced by
 * tests/unit/lib/backup/constants.test.ts).
 */
export const EXCLUDED_TABLES: ReadonlySet<string> = new Set([
  'spatial_ref_sys',
  'schema_migrations',
  'pg_stat_statements',
  'geography_columns',
  'geometry_columns',
  'activity_log',
  'api_key_usage_logs',
])
