/**
 * Module Schema Installer
 *
 * Executes a module's `database/schema.sql` file when the module is enabled.
 *
 * Rules:
 * - schema.sql is run on EVERY enable. It must be fully idempotent
 *   (CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS,
 *    DROP POLICY IF EXISTS … CREATE POLICY …, ALTER TABLE … ADD COLUMN IF NOT EXISTS).
 * - This file NEVER reads or executes `uninstall.sql`. uninstall.sql is a
 *   manual-only teardown script that the user runs themselves in the
 *   Supabase SQL editor. There is no code path here, in the module loader,
 *   or in any API route that touches uninstall.sql.
 * - Before executing, the SQL is scanned for forbidden destructive
 *   statements. If any are found, execution is refused.
 *
 * This is server-side only.
 */

import { readFile } from 'fs/promises'
import { join } from 'path'
import { getModuleById } from './module-loader'
import { getPoolClient } from '@/lib/db'

export type SchemaInstallResult =
  | { ok: true }
  | { ok: false; error: string }

/**
 * Forbidden patterns in schema.sql. These would let an enable destroy
 * user data, so the installer refuses to run a file containing any of them.
 *
 * Allowed: DROP POLICY, DROP INDEX, DROP TRIGGER (needed for re-runnable schema).
 */
const FORBIDDEN_PATTERNS: Array<{ name: string; regex: RegExp }> = [
  { name: 'DROP TABLE', regex: /\bDROP\s+TABLE\b/i },
  { name: 'DROP SCHEMA', regex: /\bDROP\s+SCHEMA\b/i },
  { name: 'DROP DATABASE', regex: /\bDROP\s+DATABASE\b/i },
  { name: 'TRUNCATE', regex: /\bTRUNCATE\b/i },
  { name: 'ALTER TABLE … DROP COLUMN', regex: /\bALTER\s+TABLE\s+\S+\s+DROP\s+COLUMN\b/i },
  // DELETE FROM <ident> with no WHERE clause before the statement-terminating semicolon
  { name: 'DELETE without WHERE', regex: /\bDELETE\s+FROM\s+["\w.]+\s*;/i },
]

/**
 * Strip SQL comments so the safety regexes don't false-positive on
 * forbidden words inside `-- comment` lines or `/* block * /` comments.
 */
function stripSqlComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\n]*/g, '')
}

/**
 * Run a module's schema.sql against the database. Idempotent and safe to
 * call on every module enable.
 *
 * @param moduleId - kebab-case module id (e.g. "module-template")
 */
export async function runModuleSchemaInstall(
  moduleId: string
): Promise<SchemaInstallResult> {
  const mod = await getModuleById(moduleId)
  if (!mod) {
    return { ok: false, error: `Module '${moduleId}' not found in manifest` }
  }

  const schemaPath = join(mod.path, 'database', 'schema.sql')

  let sqlText: string
  try {
    sqlText = await readFile(schemaPath, 'utf-8')
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException)?.code
    if (code === 'ENOENT') {
      // No schema.sql is fine — module owns no DB tables.
      return { ok: true }
    }
    return {
      ok: false,
      error: `Failed to read ${schemaPath}: ${(err as Error).message}`,
    }
  }

  // Safety guard: scan stripped SQL for forbidden destructive statements.
  const scanText = stripSqlComments(sqlText)
  for (const { name, regex } of FORBIDDEN_PATTERNS) {
    if (regex.test(scanText)) {
      const msg = `refused — forbidden destructive statement detected (${name})`
      console.error(`[module-installer] ${moduleId}: ${msg}`)
      return { ok: false, error: msg }
    }
  }

  // Execute inside a single transaction.
  let client
  try {
    client = await getPoolClient()
  } catch (err) {
    return {
      ok: false,
      error: `Failed to acquire DB connection: ${(err as Error).message}`,
    }
  }

  try {
    await client.query('BEGIN')
    await client.query(sqlText)
    await client.query('COMMIT')
    console.log(`[module-installer] Ran schema.sql for ${moduleId}`)
    return { ok: true }
  } catch (err) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // ignore rollback errors
    }
    const msg = (err as Error).message
    console.error(`[module-installer] ${moduleId} schema.sql failed: ${msg}`)
    return { ok: false, error: msg }
  } finally {
    try {
      client.release()
    } catch {
      // ignore release errors
    }
  }
}
