/**
 * Post-restore healing for backup import.
 *
 * A restore replaces module_settings with the backup's rows, whose
 * __schema_installed_hash values still match the current module manifests —
 * so the self-healing gate in lib/modules/module-registry.ts would conclude
 * every module schema is up to date and NEVER reinstall the module RLS
 * policies, triggers, indexes, and FKs the restore just wiped. Removing the
 * hash key makes the gate fire on the next authenticated load, re-running
 * each enabled module's idempotent schema.sql.
 *
 * The invalidation statement runs INSIDE the restore transaction: it operates
 * on the just-restored rows, and if module_settings exists but the update
 * fails, the whole restore rolls back (never commit a restore whose healing
 * trigger is broken). It only removes the hash key — menuPriority and other
 * settings survive. Ordering vs the integrity row-count check is irrelevant:
 * the UPDATE changes JSONB values, never row counts.
 *
 * Core-schema healing (RLS policies, functions, missing columns) happens
 * separately via reapplySchema() after COMMIT — see runPostRestoreHealing.
 */

import { SCHEMA_INSTALLED_HASH_KEY } from '@/lib/modules/schema-hash-key'

/** Single-line, self-guarding SQL that tolerates backups predating module_settings. */
export function buildModuleHashInvalidationSql(): string {
  return (
    "DO $$ BEGIN IF to_regclass('public.module_settings') IS NOT NULL THEN " +
    `UPDATE module_settings SET settings = settings - '${SCHEMA_INSTALLED_HASH_KEY}' ` +
    `WHERE settings ? '${SCHEMA_INSTALLED_HASH_KEY}'; END IF; END $$`
  )
}

/**
 * Run best-effort core-schema healing after a committed restore.
 * Never throws — a failure is surfaced as coreSchemaReapplied: false and the
 * boot-time ensureSchema() / 42703 auth-heal paths remain the backstop.
 */
export async function runPostRestoreHealing(
  reapply: () => Promise<boolean>,
): Promise<{ coreSchemaReapplied: boolean }> {
  try {
    return { coreSchemaReapplied: await reapply() }
  } catch {
    return { coreSchemaReapplied: false }
  }
}
