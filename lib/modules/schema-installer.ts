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
 *   manual-only teardown script that the user runs themselves in their SQL
 *   client of choice (Supabase Studio, pgweb, or psql). There is no code
 *   path here, in the module loader, or in any API route that touches it.
 * - Before executing, the SQL is scanned for forbidden destructive
 *   statements. If any are found, execution is refused.
 *
 * This is server-side only.
 */

import { readFile } from 'fs/promises'
import { getPoolClient } from '@/lib/db'
import { MODULE_SCHEMAS } from '@/lib/generated/module-schemas'

export type SchemaInstallResult =
  | { ok: true; alreadyExisted?: false }
  | { ok: false; alreadyExisted: true; error: string }
  | { ok: false; alreadyExisted: false; error: string }

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

/** Returns the name of the first forbidden pattern found, or null if the SQL is safe. */
export function scanForForbiddenSql(sqlText: string): string | null {
  const scanText = stripSqlComments(sqlText)
  for (const { name, regex } of FORBIDDEN_PATTERNS) {
    if (regex.test(scanText)) return name
  }
  return null
}

/**
 * Run a SQL string against the database inside a single transaction.
 * Applies the same safety scan and "already exists is harmless" semantics
 * regardless of where the SQL came from (filesystem or bundled map).
 */
async function executeSchemaSql(
  moduleId: string,
  sqlText: string
): Promise<SchemaInstallResult> {
  const forbiddenName = scanForForbiddenSql(sqlText)
  if (forbiddenName !== null) {
    const msg = `refused — forbidden destructive statement detected (${forbiddenName})`
    console.error(`[module-installer] ${moduleId}: ${msg}`)
    return { ok: false, alreadyExisted: false, error: msg }
  }

  let client
  try {
    client = await getPoolClient()
  } catch (err) {
    return {
      ok: false,
      alreadyExisted: false,
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
    const alreadyExisted = msg.includes('already exists')
    console.error(`[module-installer] ${moduleId} schema.sql failed: ${msg}`)
    return { ok: false, alreadyExisted, error: msg }
  } finally {
    try {
      client.release()
    } catch {
      // ignore release errors
    }
  }
}

/**
 * Run a schema.sql file at the given path against the database. Used by
 * the download flow, which has the path directly because the manifest cache
 * hasn't seen the new module yet. Manifest-known modules should use
 * `runModuleSchemaInstall` instead — it reads from the bundled SQL map and
 * therefore works on serverless deployments where untraced .sql files
 * aren't in the function bundle.
 */
export async function runSchemaSqlAtPath(
  moduleId: string,
  schemaPath: string
): Promise<SchemaInstallResult> {
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
      alreadyExisted: false,
      error: `Failed to read ${schemaPath}: ${(err as Error).message}`,
    }
  }
  return executeSchemaSql(moduleId, sqlText)
}

/**
 * Run a module's schema.sql against the database. Reads the SQL from
 * `lib/generated/module-schemas.ts` (an auto-generated map of every
 * known module's schema.sql), so this works on Vercel/serverless where
 * the raw .sql files aren't bundled into the function. Idempotent and
 * safe to call on every module enable.
 *
 * @param moduleId - kebab-case module id (e.g. "module-template")
 */
export async function runModuleSchemaInstall(
  moduleId: string
): Promise<SchemaInstallResult> {
  const sqlText = MODULE_SCHEMAS[moduleId]
  if (sqlText === undefined) {
    // Module owns no DB tables — same semantics as a missing file used to.
    return { ok: true }
  }
  return executeSchemaSql(moduleId, sqlText)
}
