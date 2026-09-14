/**
 * Route security convention scan.
 *
 * ARI's real tenant boundary is the API layer, not RLS (the default DB role has
 * BYPASSRLS — see docs/SECURITY.md). A per-user route missing its
 * `eq(table.userId, user.id)` filter silently leaks other users' rows.
 *
 * This suite statically scans every API route file and enforces three invariants:
 *
 *   1. AUTH    — module route files call `getAuthenticatedUser()` (unless the
 *                route is declared in `module.json` `publicRoutes`).
 *   2. FILTER  — a route that SELECT/UPDATE/DELETEs a *per-user* table must
 *                reference `user.id` in a where filter.
 *   3. STAMP   — a route that INSERTs into a classified table must stamp
 *                `userId: user.id` (owner is stamped in both data models).
 *   4. DENY-ALL — no `withRLS(...)` / `withUserContext(...)` block may query a
 *                table whose policies are deny-all (`user`, `session`,
 *                `account`, `verification`, `twoFactor`, `ari_instance`, …) or
 *                admin-only (`activity_log`). Once request-path queries run on
 *                the non-BYPASSRLS app pool those reads return EMPTY silently,
 *                not an error — such tables are read through `withAdminDb` or
 *                the raw pool only (as every current caller already does).
 *                Scanned in route files AND every lib/ file (root + modules).
 *
 * Per-user vs shared is derived from the RLS policies themselves:
 * `app.can_access_shared()` in a table's policies → shared; policies built on
 * `current_setting('app.current_user_id')` → per-user. Tables come from
 * `lib/db/setup.sql` (core) and each module's `database/schema.sql`.
 *
 * This is a heuristic file-level scan, not proof of correctness — a route can
 * pass while filtering the wrong table in a join. Genuine exceptions go in
 * EXCEPTIONS below with a one-line justification.
 *
 * modules-custom/ is scanned too when present, but violations there are
 * reported as console warnings only (it is untracked, so CI never sees it and
 * hard failures would make local `pnpm test` diverge from CI).
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const REPO_ROOT = path.resolve(__dirname, '../..')

/**
 * Known-good deviations. Key = repo-relative route path, value = why it is safe.
 * Add entries only with a justification; each one is effectively a mini code review.
 */
const EXCEPTIONS: Record<string, string> = {}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function read(p: string): string {
  return fs.readFileSync(p, 'utf8')
}

function stripSqlComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '')
}

/** Strip TS comments. `//` only when preceded by whitespace/line start so URLs survive. */
function stripTsComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1')
}

function walk(dir: string, filter: (p: string) => boolean, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, filter, out)
    else if (filter(full)) out.push(full)
  }
  return out
}

type TableModel = 'per-user' | 'shared'

/**
 * Parse CREATE POLICY statements and classify each table.
 * `app.can_access_shared()` anywhere in a table's policies wins (shared modules
 * still use current_setting in their INSERT WITH CHECK).
 */
function classifyTablesFromSql(sql: string, into: Map<string, TableModel>): void {
  const clean = stripSqlComments(sql)
  const policyRe = /CREATE\s+POLICY[^;]+?\bON\s+(?:public\.)?"?([a-zA-Z0-9_]+)"?[^;]*;/gi
  for (const m of clean.matchAll(policyRe)) {
    const table = m[1].toLowerCase()
    const stmt = m[0]
    if (/app\.can_access_shared\s*\(/.test(stmt)) {
      into.set(table, 'shared')
    } else if (/current_setting\s*\(\s*'app\.current_user_id'/.test(stmt)) {
      if (into.get(table) !== 'shared') into.set(table, 'per-user')
    }
  }
}

/**
 * Tables that request-path (RLS-context) queries must never touch.
 *  - deny-all: every policy on the table is `USING (false)` (auth + instance tables)
 *  - role-gated: SELECT is gated on `app.current_user_role` (admin-only audit tables)
 */
const denyAllTables = new Set<string>()
const roleGatedTables = new Set<string>()

function classifyRestrictedTables(sql: string): void {
  const clean = stripSqlComments(sql)
  const perTable = new Map<string, { total: number; denied: number; roleGated: boolean }>()
  const policyRe = /CREATE\s+POLICY[^;]+?\bON\s+(?:public\.)?"?([a-zA-Z0-9_]+)"?[^;]*;/gi
  for (const m of clean.matchAll(policyRe)) {
    const table = m[1].toLowerCase()
    const stmt = m[0]
    const entry = perTable.get(table) ?? { total: 0, denied: 0, roleGated: false }
    entry.total++
    if (/\bUSING\s*\(\s*false\s*\)/i.test(stmt)) entry.denied++
    if (/\bFOR\s+SELECT\b[\s\S]*app\.current_user_role/i.test(stmt)) entry.roleGated = true
    perTable.set(table, entry)
  }
  for (const [table, e] of perTable) {
    if (e.denied === e.total) denyAllTables.add(table)
    else if (e.roleGated) roleGatedTables.add(table)
  }
}

/** Map Drizzle export identifiers → SQL table names from a schema.ts file. */
function parseDrizzleExports(src: string, into: Map<string, string>): void {
  const re = /export\s+const\s+(\w+)\s*=\s*pgTable\(\s*['"]([a-zA-Z0-9_]+)['"]/g
  for (const m of src.matchAll(re)) into.set(m[1], m[2].toLowerCase())
}

// ---------------------------------------------------------------------------
// build the classification maps once
// ---------------------------------------------------------------------------

const tableModel = new Map<string, TableModel>() // sql table name → model
const drizzleToTable = new Map<string, string>() // drizzle export name → sql table name

classifyTablesFromSql(read(path.join(REPO_ROOT, 'lib/db/setup.sql')), tableModel)
classifyRestrictedTables(read(path.join(REPO_ROOT, 'lib/db/setup.sql')))
parseDrizzleExports(read(path.join(REPO_ROOT, 'lib/db/schema/core-schema.ts')), drizzleToTable)

interface ModuleInfo {
  dir: string // absolute
  rel: string // repo-relative
  publicRoutes: Array<{ path: string }>
}

function discoverModules(root: string): ModuleInfo[] {
  const abs = path.join(REPO_ROOT, root)
  if (!fs.existsSync(abs)) return []
  const modules: ModuleInfo[] = []
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const dir = path.join(abs, entry.name)
    if (!fs.existsSync(path.join(dir, 'module.json'))) continue
    let publicRoutes: Array<{ path: string }> = []
    try {
      const manifest = JSON.parse(read(path.join(dir, 'module.json')))
      if (Array.isArray(manifest.publicRoutes)) publicRoutes = manifest.publicRoutes
    } catch {
      // invalid manifest is another audit's problem; treat as no public routes
    }
    const schemaSql = path.join(dir, 'database/schema.sql')
    if (fs.existsSync(schemaSql)) {
      classifyTablesFromSql(read(schemaSql), tableModel)
      classifyRestrictedTables(read(schemaSql))
    }
    const schemaTs = path.join(dir, 'database/schema.ts')
    if (fs.existsSync(schemaTs)) parseDrizzleExports(read(schemaTs), drizzleToTable)
    modules.push({ dir, rel: path.join(root, entry.name), publicRoutes })
  }
  return modules
}

const coreModules = discoverModules('modules-core')
const customModules = discoverModules('modules-custom')

// ---------------------------------------------------------------------------
// the scanner
// ---------------------------------------------------------------------------

interface Violation {
  file: string
  rule: 'auth' | 'filter' | 'stamp' | 'deny-all'
  message: string
}

const DB_READ_WRITE_RE = /\b(?:db|tx)\s*\.\s*(?:select|update|delete)\s*\(/
const DB_EXECUTE_RE = /\b(?:db|tx)\s*\.\s*execute\s*\(/
const DB_INSERT_RE = /\b(?:db|tx)\s*\.\s*insert\s*\(/
// eq(table.userId, user.id) — also via a local `userId` variable or raw sql`${user.id}`
const OWNER_FILTER_RE =
  /(?:userId|user_id)\s*,\s*(?:user\.id|userId)\s*\)|user_id[^\n]{0,40}\$\{(?:user\.id|userId)\}/
// userId: user.id | userId: userId | `{ userId,` shorthand in .values()
const OWNER_STAMP_RE = /(?:userId|user_id)\s*:\s*(?:user\.id|userId)\b|\{\s*userId\s*,/

/** The argument text of every `withRLS(` / `withUserContext(` call (balanced parens). */
function rlsContextBlocks(src: string): string[] {
  const blocks: string[] = []
  for (const m of src.matchAll(/\bwith(?:RLS|UserContext)\s*\(/g)) {
    const open = m.index + m[0].length - 1
    let depth = 0
    for (let i = open; i < src.length; i++) {
      if (src[i] === '(') depth++
      else if (src[i] === ')' && --depth === 0) {
        blocks.push(src.slice(open + 1, i))
        break
      }
    }
  }
  return blocks
}

/** Restricted tables a code block queries — via a Drizzle table object or raw SQL. */
function restrictedTablesUsed(block: string): string[] {
  const hits = new Set<string>()
  const restricted = new Set([...denyAllTables, ...roleGatedTables])
  for (const [ident, table] of drizzleToTable) {
    if (!restricted.has(table)) continue
    const viaDrizzle = new RegExp(
      `\\.(?:from|insert|update|delete|leftJoin|innerJoin|rightJoin|fullJoin)\\(\\s*${ident}\\s*[,)]`,
    )
    if (viaDrizzle.test(block)) hits.add(table)
  }
  for (const table of restricted) {
    // raw SQL: uppercase keywords only, so prose like "from user settings" can't match
    const viaSql = new RegExp(`\\b(?:FROM|JOIN|INTO|UPDATE)\\s+(?:public\\.)?"?${table}"?(?![\\w])`)
    if (viaSql.test(block)) hits.add(table)
  }
  return [...hits].sort()
}

function denyAllViolations(rel: string, src: string): Violation[] {
  const violations: Violation[] = []
  for (const block of rlsContextBlocks(src)) {
    const hits = restrictedTablesUsed(block)
    if (hits.length === 0) continue
    violations.push({
      file: rel,
      rule: 'deny-all',
      message:
        `A withRLS/withUserContext block queries ${hits.join(', ')}. Those tables are deny-all or ` +
        'admin-only under RLS: on the non-BYPASSRLS app pool the query returns nothing, silently. ' +
        'Read them through withAdminDb / the raw pool instead.',
    })
  }
  return violations
}

/** Drizzle table identifiers referenced by this file, resolved to models. */
function referencedModels(src: string): Set<TableModel> {
  const models = new Set<TableModel>()
  for (const [ident, table] of drizzleToTable) {
    const model = tableModel.get(table)
    if (!model) continue
    // member access like `notepadRevisions.userId` or bare use in from()/insert()
    if (new RegExp(`\\b${ident}\\b`).test(src)) models.add(model)
  }
  return models
}

/**
 * True when the route authenticates through a helper in its own module's lib
 * (e.g. health-data's `requireHealthData`) — resolved one import level deep.
 */
function authViaModuleLib(src: string, moduleDir: string): boolean {
  const importRe = /from\s+['"](?:@\/modules\/[^/'"]+|\.{1,2})(\/[^'"]+)['"]/g
  for (const m of src.matchAll(importRe)) {
    for (const candidate of [
      path.join(moduleDir, `${m[1]}.ts`),
      path.join(moduleDir, m[1], 'index.ts'),
    ]) {
      if (fs.existsSync(candidate) && read(candidate).includes('getAuthenticatedUser')) return true
    }
  }
  return false
}

function scanRouteFile(
  absFile: string,
  opts: { requireAuth: boolean; moduleDir?: string },
): Violation[] {
  const rel = path.relative(REPO_ROOT, absFile)
  if (EXCEPTIONS[rel]) return []
  const src = stripTsComments(read(absFile))
  const violations: Violation[] = []

  const models = referencedModels(src)
  const touchesPerUser = models.has('per-user')
  const touchesClassified = models.size > 0
  const reads = DB_READ_WRITE_RE.test(src) || DB_EXECUTE_RE.test(src)

  if (
    opts.requireAuth &&
    !src.includes('getAuthenticatedUser') &&
    !(opts.moduleDir && authViaModuleLib(src, opts.moduleDir))
  ) {
    violations.push({
      file: rel,
      rule: 'auth',
      message:
        'Route handler never calls getAuthenticatedUser(). Every module route must authenticate ' +
        '(or be declared in module.json publicRoutes with its own security).',
    })
  }

  if (touchesPerUser && reads && !OWNER_FILTER_RE.test(src)) {
    violations.push({
      file: rel,
      rule: 'filter',
      message:
        'File queries a PER-USER table with select/update/delete but never filters by the owner ' +
        '(no `eq(table.userId, user.id)` / `${user.id}` found). This can leak or modify other ' +
        "users' private rows — the API filter is the real tenant boundary (BYPASSRLS).",
    })
  }

  if (touchesClassified && DB_INSERT_RE.test(src) && !OWNER_STAMP_RE.test(src)) {
    violations.push({
      file: rel,
      rule: 'stamp',
      message:
        'File inserts into a classified table but never stamps `userId: user.id`. ' +
        'INSERT must set the owner in both the per-user and shared data models.',
    })
  }

  violations.push(...denyAllViolations(rel, src))

  return violations
}

/** DENY-ALL only, over every .ts under the given repo-relative directories (tests excluded). */
function scanLibFiles(roots: string[]): Violation[] {
  const violations: Violation[] = []
  for (const root of roots) {
    const files = walk(
      path.join(REPO_ROOT, root),
      (p) => p.endsWith('.ts') && !p.endsWith('.test.ts') && !p.includes('/generated/'),
    )
    for (const file of files) {
      const rel = path.relative(REPO_ROOT, file)
      if (EXCEPTIONS[rel]) continue
      violations.push(...denyAllViolations(rel, stripTsComments(read(file))))
    }
  }
  return violations
}

function isPublicRoute(mod: ModuleInfo, absFile: string): boolean {
  // api/foo/bar/route.ts → "foo/bar"; api/route.ts → ""
  const apiRel = path
    .relative(path.join(mod.dir, 'api'), absFile)
    .replace(/\/?route\.ts$/, '')
    .replace(/\\/g, '/')
  return mod.publicRoutes.some((r) => {
    const declared = (r.path || '').replace(/^\/+|\/+$/g, '')
    return declared === apiRel
  })
}

function scanModules(modules: ModuleInfo[]): Violation[] {
  const violations: Violation[] = []
  for (const mod of modules) {
    const routeFiles = walk(path.join(mod.dir, 'api'), (p) => p.endsWith('route.ts'))
    for (const file of routeFiles) {
      violations.push(
        ...scanRouteFile(file, { requireAuth: !isPublicRoute(mod, file), moduleDir: mod.dir }),
      )
    }
  }
  return violations
}

function scanAppApi(): Violation[] {
  // app/api has system/public routes (auth handler, health, welcome/setup), so
  // auth presence is not enforced here — but the tenant-filter and owner-stamp
  // rules still apply to any file touching classified tables.
  const violations: Violation[] = []
  const routeFiles = walk(path.join(REPO_ROOT, 'app/api'), (p) => p.endsWith('route.ts'))
  for (const file of routeFiles) {
    violations.push(...scanRouteFile(file, { requireAuth: false }))
  }
  return violations
}

function format(violations: Violation[]): string {
  return violations.map((v) => `\n[${v.rule}] ${v.file}\n    ${v.message}`).join('\n')
}

// ---------------------------------------------------------------------------
// tests
// ---------------------------------------------------------------------------

describe('route security scan — sanity', () => {
  it('classified core tables from setup.sql', () => {
    expect(tableModel.get('tasks')).toBe('shared')
    expect(tableModel.get('module_settings')).toBe('per-user')
  })

  it('mapped drizzle exports to table names', () => {
    expect(drizzleToTable.get('userPreferences')).toBe('user_preferences')
  })

  it('found route files to scan', () => {
    expect(coreModules.length).toBeGreaterThan(5)
  })

  it('classified deny-all and admin-only tables from the policies', () => {
    for (const t of ['user', 'session', 'account', 'verification', 'twofactor', 'ari_instance']) {
      expect(denyAllTables.has(t), `${t} should be deny-all`).toBe(true)
    }
    expect(roleGatedTables.has('activity_log')).toBe(true)
    expect(denyAllTables.has('tasks')).toBe(false)
    expect(denyAllTables.has('module_settings')).toBe(false)
  })

  it('deny-all detection sees Drizzle and raw-SQL usage inside RLS blocks only', () => {
    const drizzle = `await withRLS((db) => db.select().from(user).where(eq(user.id, id)))`
    const raw = 'await withUserContext(uid, (db) => db.execute(sql`SELECT 1 FROM "user"`))'
    const admin = `const { user } = await getAuthenticatedUser(); await withAdminDb((db) => db.select().from(user))`
    const other = `await withRLS((db) => db.select().from(userPreferences).where(eq(userPreferences.userId, user.id)))`
    expect(denyAllViolations('x.ts', drizzle)).toHaveLength(1)
    expect(denyAllViolations('x.ts', raw)).toHaveLength(1)
    expect(denyAllViolations('x.ts', admin)).toHaveLength(0)
    expect(denyAllViolations('x.ts', other)).toHaveLength(0)
  })
})

describe('route security scan — deny-all tables never read under RLS (lib + modules)', () => {
  it('root lib/ and modules-core lib/ never query deny-all or admin-only tables inside withRLS', () => {
    const roots = ['lib', ...coreModules.map((m) => path.join(m.rel, 'lib'))]
    const violations = scanLibFiles(roots)
    expect(violations, format(violations)).toEqual([])
  })

  it('modules-custom lib/ (warn-only)', () => {
    const violations = scanLibFiles(customModules.map((m) => path.join(m.rel, 'lib')))
    if (violations.length > 0) {
      console.warn(
        `\n⚠ route-security-scan: ${violations.length} deny-all issue(s) in modules-custom lib ` +
          `(not failing the suite):${format(violations)}\n`,
      )
    }
    expect(true).toBe(true)
  })
})

describe('route security scan — app/api', () => {
  it('per-user tables are always owner-filtered and inserts owner-stamped', () => {
    const violations = scanAppApi()
    expect(violations, format(violations)).toEqual([])
  })
})

describe('route security scan — modules-core', () => {
  it('routes authenticate, filter per-user tables, and stamp inserts', () => {
    const violations = scanModules(coreModules)
    expect(violations, format(violations)).toEqual([])
  })
})

describe('route security scan — modules-custom (warn-only)', () => {
  it('reports violations as warnings (untracked locally, absent in CI)', () => {
    const violations = scanModules(customModules)
    if (violations.length > 0) {
      console.warn(
        `\n⚠ route-security-scan: ${violations.length} potential issue(s) in modules-custom ` +
          `(not failing the suite):${format(violations)}\n`,
      )
    }
    expect(true).toBe(true)
  })
})
