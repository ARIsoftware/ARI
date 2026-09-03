/**
 * Quote-aware SQL statement splitting + classification for backup import.
 *
 * The previous parser was line-based and literal-blind: it dropped any line
 * starting with `--` or ending with `;` even in the middle of a string
 * literal, silently corrupting or splitting multi-line values. This one is a
 * single-pass character state machine that tracks:
 *   - plain '...' literals ('' escape; raw newlines are content)
 *   - E'...' literals (backslash escapes, detected with pg's lexer rule)
 *   - "quoted identifiers" ("" escape)
 *   - $tag$...$tag$ dollar quotes (needed for DO $$ ... $$ blocks)
 *   - `--` line comments and nested slash-star block comments, both only
 *     OUTSIDE literals
 *
 * Because raw newlines inside plain literals are just content here, legacy
 * v2.1 backups (whose exporter wrote multi-line values verbatim) parse
 * correctly too — no version fork.
 *
 * Pure logic — no database access.
 */

export interface SplitResult {
  /** Trimmed statements, comments removed, no trailing semicolon. */
  statements: string[]
  /** Non-whitespace leftover at EOF — a truncated final statement. */
  trailingContent: string
}

const DOLLAR_TAG_RE = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/

/** pg lexer rule: a quote is an E-string iff preceded by a bare E/e that is
 *  not itself the tail of an identifier or adjacent literal. */
function isEStringQuote(content: string, quoteIndex: number): boolean {
  const prev = content[quoteIndex - 1]
  if (prev !== 'E' && prev !== 'e') return false
  const beforePrev = content[quoteIndex - 2]
  return beforePrev === undefined || !/[A-Za-z0-9_$"']/.test(beforePrev)
}

/** Scan past a single-quoted literal starting at `start` (the opening quote).
 *  Returns the index just after the closing quote, or content.length if
 *  unterminated. */
function scanSingleQuoted(content: string, start: number, eString: boolean): number {
  let i = start + 1
  while (i < content.length) {
    const ch = content[i]
    if (eString && ch === '\\') {
      i += 2
      continue
    }
    if (ch === "'") {
      if (content[i + 1] === "'") {
        i += 2 // '' escape
        continue
      }
      return i + 1
    }
    i++
  }
  return content.length
}

/** Scan past a double-quoted identifier. Same contract as scanSingleQuoted. */
function scanDoubleQuoted(content: string, start: number): number {
  let i = start + 1
  while (i < content.length) {
    if (content[i] === '"') {
      if (content[i + 1] === '"') {
        i += 2 // "" escape
        continue
      }
      return i + 1
    }
    i++
  }
  return content.length
}

export function splitSqlStatements(content: string): SplitResult {
  const statements: string[] = []
  let buf = ''
  let i = 0
  const n = content.length

  while (i < n) {
    const ch = content[i]

    // Line comment — skipped entirely, never appended to the statement.
    if (ch === '-' && content[i + 1] === '-') {
      while (i < n && content[i] !== '\n') i++
      continue
    }

    // Block comment, with nesting (Postgres nests block comments). Replaced
    // by a single space so `a/*c*/b` does not splice into `ab` — Postgres
    // treats a comment as whitespace.
    if (ch === '/' && content[i + 1] === '*') {
      let depth = 1
      i += 2
      while (i < n && depth > 0) {
        if (content[i] === '/' && content[i + 1] === '*') {
          depth++
          i += 2
        } else if (content[i] === '*' && content[i + 1] === '/') {
          depth--
          i += 2
        } else {
          i++
        }
      }
      buf += ' '
      continue
    }

    if (ch === ';') {
      const statement = buf.trim()
      if (statement) statements.push(statement)
      buf = ''
      i++
      continue
    }

    if (ch === '"') {
      const end = scanDoubleQuoted(content, i)
      buf += content.slice(i, end)
      i = end
      continue
    }

    if (ch === "'") {
      const end = scanSingleQuoted(content, i, isEStringQuote(content, i))
      buf += content.slice(i, end)
      i = end
      continue
    }

    if (ch === '$') {
      const tagMatch = DOLLAR_TAG_RE.exec(content.slice(i, i + 64))
      if (tagMatch) {
        const tag = tagMatch[0]
        const close = content.indexOf(tag, i + tag.length)
        if (close === -1) {
          buf += content.slice(i)
          i = n
          continue
        }
        buf += content.slice(i, close + tag.length)
        i = close + tag.length
        continue
      }
      buf += ch
      i++
      continue
    }

    buf += ch
    i++
  }

  return { statements, trailingContent: buf.trim() }
}

export type StatementKind = 'drop' | 'create' | 'insert' | 'index' | 'delete' | 'other' | 'skipped'

/** Classify one trimmed statement by its leading keyword(s). */
export function classifyStatement(statement: string): StatementKind {
  if (/^DROP\s+TABLE\b/i.test(statement)) return 'drop'
  if (/^CREATE\s+TABLE\b/i.test(statement)) return 'create'
  if (/^INSERT\s+INTO\b/i.test(statement)) return 'insert'
  if (/^CREATE\s+(UNIQUE\s+)?INDEX\b/i.test(statement)) return 'index'
  if (/^DELETE\s+FROM\b/i.test(statement)) return 'delete'
  // Transaction control / session settings / read-only probes are never
  // executed — the import route manages its own transaction.
  if (/^(BEGIN|COMMIT|ROLLBACK|SET|SELECT)\b/i.test(statement)) return 'skipped'
  return 'other'
}

export interface ParsedBackup {
  drops: string[]
  creates: string[]
  inserts: string[]
  indexes: string[]
  deletes: string[]
  other: string[]
  skipped: string[]
  trailingContent: string
}

/** Split + classify a whole backup file. */
export function parseBackup(content: string): ParsedBackup {
  const { statements, trailingContent } = splitSqlStatements(content)
  const parsed: ParsedBackup = {
    drops: [],
    creates: [],
    inserts: [],
    indexes: [],
    deletes: [],
    other: [],
    skipped: [],
    trailingContent,
  }
  for (const statement of statements) {
    switch (classifyStatement(statement)) {
      case 'drop':
        parsed.drops.push(statement)
        break
      case 'create':
        parsed.creates.push(statement)
        break
      case 'insert':
        parsed.inserts.push(statement)
        break
      case 'index':
        parsed.indexes.push(statement)
        break
      case 'delete':
        parsed.deletes.push(statement)
        break
      case 'skipped':
        parsed.skipped.push(statement)
        break
      default:
        parsed.other.push(statement)
    }
  }
  return parsed
}
