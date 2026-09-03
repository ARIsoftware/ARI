/**
 * Expected-table computation for the backup verify route.
 *
 * The expected set is derived from the SQL that actually creates tables —
 * lib/db/setup.sql for core and each module's schema.sql (via the generated
 * MODULE_SCHEMAS map) — rather than manifests (can go stale) or Drizzle
 * definitions (setup.sql may create tables Drizzle doesn't model).
 *
 * Pure logic — no database access.
 */

const CREATE_TABLE_RE =
  /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\s*\.\s*)?("?)([A-Za-z_][A-Za-z0-9_]*)\1/gi

/** Table names created by a SQL script (quoted, unquoted, schema-qualified). */
export function parseCreatedTables(sql: string): string[] {
  // Strip line comments so commented-out DDL (and prose mentioning
  // CREATE TABLE) never counts. Schema files are DDL — the naive per-line
  // strip is safe there.
  const withoutComments = sql
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')

  const names = new Set<string>()
  for (const match of withoutComments.matchAll(CREATE_TABLE_RE)) {
    names.add(match[2])
  }
  return [...names]
}

export interface TableDiffInput {
  /** Tables that exist in the live database (already minus EXCLUDED_TABLES). */
  live: string[]
  /** Tables created by core setup.sql. */
  core: string[]
  /** Per-module: tables its schema.sql creates, and whether the module is enabled. */
  modules: Record<string, { tables: string[]; enabled: boolean }>
}

export interface TableDiff {
  /** Expected (core + enabled modules) but absent from the live DB — real problems. */
  missing: string[]
  /** Live tables no known source creates — genuinely unknown. Disabled-module
   *  leftovers are NOT extra (their data legitimately persists while disabled). */
  extra: string[]
  /** |core ∪ enabled modules' tables ∪ known leftovers present live|. Known
   *  disabled-module tables that exist count in the denominator so the UI's
   *  "found / expected" fraction agrees on healthy installs. */
  expectedCount: number
}

export function computeTableDiff(input: TableDiffInput): TableDiff {
  const expected = new Set(input.core)
  const allKnown = new Set(input.core)
  for (const { tables, enabled } of Object.values(input.modules)) {
    for (const table of tables) {
      allKnown.add(table)
      if (enabled) expected.add(table)
    }
  }

  const live = new Set(input.live)
  const missing = [...expected].filter((t) => !live.has(t)).sort()
  const extra = input.live.filter((t) => !allKnown.has(t)).sort()

  // Present leftovers from disabled modules are legitimate — count them as
  // expected (they are live and known), never as missing when absent.
  for (const table of input.live) {
    if (allKnown.has(table)) expected.add(table)
  }

  return { missing, extra, expectedCount: expected.size }
}
