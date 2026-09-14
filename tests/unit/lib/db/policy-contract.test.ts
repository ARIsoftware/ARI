/**
 * RLS policy contract — static checks over every schema SQL file.
 *
 * ARI is moving request-path queries onto a non-BYPASSRLS role (see the
 * "DB-level RLS enforcement" plan; `docs/SECURITY.md`). Once that lands the
 * policies stop being decorative, so this suite pins the properties they must
 * have BEFORE enforcement flips on:
 *
 *   (a) missing_ok  — every `current_setting('app.…')` inside a policy passes
 *                     `true` as its second argument, so an un-contexted
 *                     connection deterministically denies (NULL comparison)
 *                     instead of raising 42704 on a fresh connection.
 *   (b) WITH CHECK  — every `FOR UPDATE` policy spells out its `WITH CHECK`.
 *                     Postgres already applies USING to the new row when it is
 *                     omitted; this is a style rule so intent is explicit and
 *                     a future asymmetric policy is a visible diff.
 *   (c) lockstep    — tables defined in BOTH lib/db/setup.sql and a module
 *                     schema carry identical policies (after normalisation:
 *                     `TO public`, quoting and whitespace are ignored) and the
 *                     same ownership trigger, so whichever file applies last
 *                     leaves the same rules in place.
 *   (d) definer     — every SECURITY DEFINER function is followed by
 *                     `REVOKE ALL ON FUNCTION … FROM PUBLIC` (they read
 *                     information_schema and are a table-name/row-count oracle
 *                     for anyone who can call them — e.g. PostgREST roles).
 *   (e) InitPlan    — `app.can_access_shared()` and `current_setting(…)` are
 *                     always wrapped as `(SELECT …)` inside policies so the
 *                     planner evaluates them once per statement, not per row
 *                     (`can_access_shared` has `SET search_path` and cannot be
 *                     inlined — bare, it would run for every row scanned).
 *   (f) index       — every per-user table has an index (or PK/UNIQUE) whose
 *                     leading column is `user_id`; under enforcement the USING
 *                     predicate becomes an index condition on every query.
 *   (g) trigger     — every shared table whose UPDATE is not deny-all attaches
 *                     `app.prevent_user_id_reassignment()` (RLS cannot compare
 *                     OLD/NEW, so this is what stops ownership hijacking), and
 *                     the function raises with a non-42501 SQLSTATE so the
 *                     app-pool grant-miss handler can never mistake it for a
 *                     missing grant.
 *
 * lib/db/setup.sql and modules-core/ are hard failures. modules-custom/ is
 * scanned when present but only warns (it is untracked, so CI never sees it).
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const REPO_ROOT = path.resolve(__dirname, '../../../..')
const SETUP_SQL = 'lib/db/setup.sql'

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function read(rel: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8')
}

function stripSqlComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '')
}

/** Every `<root>/<module>/database/schema.sql`, repo-relative. */
function moduleSchemas(root: string): string[] {
  const abs = path.join(REPO_ROOT, root)
  if (!fs.existsSync(abs)) return []
  return fs
    .readdirSync(abs, { withFileTypes: true })
    .filter((e) => e.isDirectory() || e.isSymbolicLink())
    .map((e) => path.join(root, e.name, 'database/schema.sql'))
    .filter((rel) => fs.existsSync(path.join(REPO_ROOT, rel)))
    .sort()
}

/** Index of the ')' matching the '(' at `open`. */
function closingParen(text: string, open: number): number {
  let depth = 0
  for (let i = open; i < text.length; i++) {
    if (text[i] === '(') depth++
    else if (text[i] === ')' && --depth === 0) return i
  }
  throw new Error(`unbalanced parentheses at ${open}`)
}

function clause(body: string, keyword: RegExp): string | null {
  const m = keyword.exec(body)
  if (!m) return null
  const open = m.index + m[0].length - 1
  return body.slice(open + 1, closingParen(body, open))
}

interface Policy {
  file: string
  name: string
  table: string
  cmd: string
  using: string | null
  withCheck: string | null
  body: string
}

const POLICY_RE = /CREATE\s+POLICY\s+("[^"]+"|\w+)\s+ON\s+(?:public\.)?("?)(\w+)"?([\s\S]*?);/gi

function parsePolicies(file: string, clean: string): Policy[] {
  const out: Policy[] = []
  for (const m of clean.matchAll(POLICY_RE)) {
    const body = m[4]
    const cmd = (
      /\bFOR\s+(SELECT|INSERT|UPDATE|DELETE|ALL)\b/i.exec(body)?.[1] ?? 'ALL'
    ).toUpperCase()
    out.push({
      file,
      name: m[1].replace(/"/g, ''),
      table: m[3].toLowerCase(),
      cmd,
      using: clause(body, /\bUSING\s*\(/i),
      withCheck: clause(body, /\bWITH\s+CHECK\s*\(/i),
      body,
    })
  }
  return out
}

/**
 * Whitespace/quoting-insensitive form for lockstep comparison. `::text` casts
 * are dropped too: user_id is TEXT everywhere, so `user_id::text = x` and
 * `user_id = x` are the same predicate (the two copies of music_playlist differ
 * only in that cast).
 */
function normalise(sql: string | null): string {
  if (sql === null) return ''
  return sql
    .replace(/"/g, '')
    .replace(/::text\b/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*\(\s*/g, '(')
    .replace(/\s*\)\s*/g, ')')
    .trim()
    .toLowerCase()
}

/** Tables → set of leading index / PK / UNIQUE columns, across all files. */
function leadingIndexColumns(cleanTexts: string[]): Map<string, Set<string>> {
  const lead = new Map<string, Set<string>>()
  const add = (table: string, col: string) => {
    const t = table.toLowerCase()
    if (!lead.has(t)) lead.set(t, new Set())
    lead.get(t)!.add(col.toLowerCase())
  }
  const INDEX_RE =
    /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?"?\w+"?\s+ON\s+(?:public\.)?"?(\w+)"?\s*(?:USING\s+\w+\s*)?\(\s*"?(\w+)"?/gi
  const TABLE_RE =
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?"?(\w+)"?\s*\(([\s\S]*?)\n\);/gi
  for (const text of cleanTexts) {
    for (const m of text.matchAll(INDEX_RE)) add(m[1], m[2])
    for (const t of text.matchAll(TABLE_RE)) {
      for (const c of t[2].matchAll(/(?:PRIMARY\s+KEY|UNIQUE)\s*\(\s*"?(\w+)"?/gi)) add(t[1], c[1])
      for (const c of t[2].matchAll(/^\s*"?(\w+)"?\s+\w+[^,\n]*\b(?:PRIMARY\s+KEY|UNIQUE)\b/gim)) {
        add(t[1], c[1])
      }
    }
  }
  return lead
}

/** Tables → set of trigger function names attached BEFORE UPDATE, per file. */
function updateTriggers(clean: string): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>()
  const TRIGGER_RE =
    /CREATE\s+TRIGGER\s+"?\w+"?\s+BEFORE\s+UPDATE\s+ON\s+(?:public\.)?"?(\w+)"?[\s\S]*?EXECUTE\s+(?:FUNCTION|PROCEDURE)\s+((?:\w+\.)?\w+)\s*\(/gi
  for (const m of clean.matchAll(TRIGGER_RE)) {
    const t = m[1].toLowerCase()
    if (!out.has(t)) out.set(t, new Set())
    out.get(t)!.add(m[2].toLowerCase())
  }
  return out
}

// ---------------------------------------------------------------------------
// load
// ---------------------------------------------------------------------------

interface SchemaFile {
  rel: string
  raw: string
  clean: string
  policies: Policy[]
  triggers: Map<string, Set<string>>
  warnOnly: boolean
}

function load(rel: string, warnOnly: boolean): SchemaFile {
  const raw = read(rel)
  const clean = stripSqlComments(raw)
  return {
    rel,
    raw,
    clean,
    policies: parsePolicies(rel, clean),
    triggers: updateTriggers(clean),
    warnOnly,
  }
}

const files: SchemaFile[] = [
  load(SETUP_SQL, false),
  ...moduleSchemas('modules-core').map((rel) => load(rel, false)),
  ...moduleSchemas('modules-custom').map((rel) => load(rel, true)),
]

const allPolicies = files.flatMap((f) => f.policies)
const leadCols = leadingIndexColumns(files.map((f) => f.clean))

type Model = 'per-user' | 'shared' | 'other'
const tableModel = new Map<string, Model>()
for (const p of allPolicies) {
  const shared = /app\.can_access_shared\s*\(/i.test(p.body)
  const perUser = /current_setting\s*\(\s*'app\.current_user_id'/i.test(p.body)
  const prev = tableModel.get(p.table)
  if (shared) tableModel.set(p.table, 'shared')
  else if (perUser && prev !== 'shared') tableModel.set(p.table, 'per-user')
  else if (!prev) tableModel.set(p.table, 'other')
}

/** A shared table where UPDATE is not `USING (false)` must carry the ownership trigger. */
function needsOwnershipTrigger(table: string, policies: Policy[]): boolean {
  if (tableModel.get(table) !== 'shared') return false
  const update = policies.find((p) => p.table === table && p.cmd === 'UPDATE')
  return !!update && !/^\s*false\s*$/i.test(update.using ?? '')
}

interface Violation {
  file: string
  rule: string
  message: string
}

function check(f: SchemaFile): Violation[] {
  const v: Violation[] = []
  const push = (rule: string, message: string) => v.push({ file: f.rel, rule, message })

  for (const p of f.policies) {
    const where = `policy ${p.name} on ${p.table}`

    // (a) missing_ok
    for (const m of p.body.matchAll(/current_setting\s*\(\s*'(app\.\w+)'\s*([^)]*)\)/gi)) {
      if (!/^,\s*true$/i.test(m[2].trim())) {
        push('missing_ok', `${where}: current_setting('${m[1]}') must pass missing_ok (\`, true\`)`)
      }
    }

    // (b) explicit WITH CHECK on UPDATE
    if (p.cmd === 'UPDATE' && p.withCheck === null) {
      push('with_check', `${where}: FOR UPDATE policy must spell out WITH CHECK (mirror USING)`)
    }

    // (e) InitPlan wrapping
    for (const m of p.body.matchAll(/app\.can_access_shared\s*\(\s*\)/gi)) {
      if (!/\(\s*SELECT\s*$/i.test(p.body.slice(0, m.index))) {
        push(
          'initplan',
          `${where}: app.can_access_shared() must be written (SELECT app.can_access_shared())`,
        )
      }
    }
    for (const m of p.body.matchAll(/current_setting\s*\(/gi)) {
      if (!/\(\s*SELECT\s*$/i.test(p.body.slice(0, m.index))) {
        push(
          'initplan',
          `${where}: current_setting(...) must be written (SELECT current_setting(...))`,
        )
      }
    }
  }

  const tables = new Set(f.policies.map((p) => p.table))
  for (const table of tables) {
    // (f) per-user tables are indexed on user_id
    if (tableModel.get(table) === 'per-user' && !leadCols.get(table)?.has('user_id')) {
      push('index', `table ${table}: per-user table has no index/PK/UNIQUE leading on user_id`)
    }
    // (g) shared tables carry the ownership-immutability trigger
    if (
      needsOwnershipTrigger(table, f.policies) &&
      !f.triggers.get(table)?.has('app.prevent_user_id_reassignment')
    ) {
      push(
        'ownership_trigger',
        `table ${table}: shared table must attach app.prevent_user_id_reassignment() BEFORE UPDATE`,
      )
    }
  }

  // (d) SECURITY DEFINER functions are owner-only
  const definerRe = /SECURITY\s+DEFINER/gi
  for (const m of f.clean.matchAll(definerRe)) {
    const before = f.clean.slice(0, m.index)
    const decls = [
      ...before.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+((?:\w+\.)?\w+)\s*\(/gi),
    ]
    const fn = decls.at(-1)?.[1]
    if (!fn) {
      push(
        'security_definer',
        `SECURITY DEFINER at offset ${m.index} has no parseable CREATE FUNCTION`,
      )
      continue
    }
    const revoke = new RegExp(
      `REVOKE\\s+ALL\\s+ON\\s+FUNCTION\\s+${fn.replace('.', '\\.')}\\s*\\([^)]*\\)\\s+FROM\\s+PUBLIC`,
      'i',
    )
    if (!revoke.test(f.clean.slice(m.index))) {
      push(
        'security_definer',
        `function ${fn}: SECURITY DEFINER must be followed by REVOKE ALL ON FUNCTION ${fn}(...) FROM PUBLIC`,
      )
    }
  }

  return v
}

function format(violations: Violation[]): string {
  return violations.map((v) => `\n[${v.rule}] ${v.file}\n    ${v.message}`).join('\n')
}

// ---------------------------------------------------------------------------
// tests
// ---------------------------------------------------------------------------

describe('policy contract — sanity', () => {
  it('parsed the schema files it expects', () => {
    expect(files.map((f) => f.rel)).toContain(SETUP_SQL)
    expect(files.filter((f) => !f.warnOnly).length).toBeGreaterThan(10)
    expect(allPolicies.length).toBeGreaterThan(200)
  })

  it('classified the canonical examples', () => {
    expect(tableModel.get('tasks')).toBe('shared')
    expect(tableModel.get('task_subtasks')).toBe('shared')
    expect(tableModel.get('module_settings')).toBe('per-user')
    expect(tableModel.get('user')).toBe('other')
  })

  it('setup.sql defines the ownership trigger function with a non-42501 SQLSTATE', () => {
    const setup = files[0].clean
    const fn =
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+app\.prevent_user_id_reassignment\(\)[\s\S]*?\$\$\s*LANGUAGE\s+plpgsql/i.exec(
        setup,
      )
    expect(fn, 'app.prevent_user_id_reassignment() missing from setup.sql').not.toBeNull()
    const body = fn![0]
    expect(body).toMatch(/current_setting\('app\.enforced',\s*true\)\s*=\s*'on'/)
    expect(body).toMatch(/NEW\.user_id\s+IS\s+DISTINCT\s+FROM\s+OLD\.user_id/)
    expect(body).toMatch(/ERRCODE\s*=\s*'P0001'/)
    expect(body).not.toMatch(/42501|insufficient_privilege/i)
  })
})

describe('policy contract — lib/db/setup.sql + modules-core', () => {
  it('(a) missing_ok, (b) WITH CHECK, (d) definer revokes, (e) InitPlan, (f) user_id index, (g) ownership trigger', () => {
    const violations = files.filter((f) => !f.warnOnly).flatMap(check)
    expect(violations, format(violations)).toEqual([])
  })

  it('(c) double-defined tables are in lockstep across setup.sql and module schemas', () => {
    const setup = files[0]
    const problems: string[] = []
    for (const mod of files.filter((f) => !f.warnOnly && f.rel !== SETUP_SQL)) {
      const shared = new Set(
        mod.policies.map((p) => p.table).filter((t) => setup.policies.some((p) => p.table === t)),
      )
      for (const table of shared) {
        const key = (p: Policy) =>
          `${p.name}|${p.cmd}|${normalise(p.using)}|${normalise(p.withCheck)}`
        const a = setup.policies
          .filter((p) => p.table === table)
          .map(key)
          .sort()
        const b = mod.policies
          .filter((p) => p.table === table)
          .map(key)
          .sort()
        if (JSON.stringify(a) !== JSON.stringify(b)) {
          problems.push(
            `${table}: policies differ between ${SETUP_SQL} and ${mod.rel}\n  setup:  ${a.join('\n          ')}\n  module: ${b.join('\n          ')}`,
          )
        }
        const ta = [...(setup.triggers.get(table) ?? [])].sort()
        const tb = [...(mod.triggers.get(table) ?? [])].sort()
        if (JSON.stringify(ta) !== JSON.stringify(tb)) {
          problems.push(
            `${table}: BEFORE UPDATE triggers differ between ${SETUP_SQL} (${ta}) and ${mod.rel} (${tb})`,
          )
        }
      }
      if (shared.size > 0 && mod.rel.includes('/tasks/')) expect(shared.has('tasks')).toBe(true)
    }
    expect(problems, problems.join('\n')).toEqual([])
  })

  it('every shared table with a live UPDATE policy attaches exactly one ownership trigger', () => {
    const tables = [...tableModel.entries()].filter(([, m]) => m === 'shared').map(([t]) => t)
    expect(tables.length).toBeGreaterThan(10)
    for (const table of tables) {
      if (!needsOwnershipTrigger(table, allPolicies)) continue
      const definers = files.filter(
        (f) => !f.warnOnly && f.triggers.get(table)?.has('app.prevent_user_id_reassignment'),
      )
      const owners = files.filter((f) => !f.warnOnly && f.policies.some((p) => p.table === table))
      expect(
        definers.map((f) => f.rel),
        `${table}: trigger must be defined in every file that defines its policies`,
      ).toEqual(owners.map((f) => f.rel))
    }
  })
})

describe('policy contract — modules-custom (warn-only)', () => {
  it('reports violations as warnings (untracked locally, absent in CI)', () => {
    const violations = files.filter((f) => f.warnOnly).flatMap(check)
    if (violations.length > 0) {
      console.warn(
        `\n⚠ policy-contract: ${violations.length} issue(s) in modules-custom (not failing the suite):${format(violations)}\n`,
      )
    }
    expect(true).toBe(true)
  })
})
