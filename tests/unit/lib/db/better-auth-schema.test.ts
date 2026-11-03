import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getAuthTables } from 'better-auth/db'
import { twoFactor } from 'better-auth/plugins/two-factor'
import { describe, expect, it } from 'vitest'

// Better Auth rejects every auth request with "Database schema mismatch" when a
// column it expects is missing, so nobody can sign in. ARI creates these tables
// itself in setup.sql rather than through `auth migrate`, which means a Better
// Auth upgrade that adds a column must add it here too. Every other auth test
// mocks the database, so this is the only check that would catch the gap.
const setupSql = readFileSync(join(process.cwd(), 'lib/db/setup.sql'), 'utf8')

function columnsInSetupSql(table: string): Set<string> {
  const columns = new Set<string>()
  const create = setupSql.match(
    new RegExp(`CREATE TABLE IF NOT EXISTS "${table}" \\(([\\s\\S]*?)\\n\\);`),
  )
  for (const [, column] of create?.[1].matchAll(/^\s*"(\w+)"/gm) ?? []) columns.add(column)
  const alter = new RegExp(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "(\\w+)"`, 'g')
  for (const [, column] of setupSql.matchAll(alter)) columns.add(column)
  return columns
}

describe('setup.sql provides every column Better Auth requires', () => {
  // Same plugin list as lib/auth.ts; only twoFactor adds schema.
  const tables = getAuthTables({ plugins: [twoFactor()] })

  for (const table of Object.values(tables)) {
    it(`"${table.modelName}" has all its columns`, () => {
      const expected = Object.entries(table.fields).map(([key, field]) => field.fieldName ?? key)
      const missing = expected.filter((column) => !columnsInSetupSql(table.modelName).has(column))
      expect(missing).toEqual([])
    })
  }
})
