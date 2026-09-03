/**
 * Backup file validation for import.
 *
 * Operates on the raw file text plus the ParsedBackup from parse.ts. The
 * critical design decision: the dangerous-pattern scan runs over PARSED
 * non-INSERT statements only — never over INSERT data, comments, or skipped
 * transaction-control lines. Row data is not code; a task titled "Truncate
 * old logs" must never block a restore.
 *
 * Integrity story:
 * - v3 files embed contentSha256 (sha256 of every byte after the metadata
 *   line) — verified here, hard error on mismatch or absence.
 * - v2.x files predate it — warning only; row counts still verify in-
 *   transaction at import time.
 * - A missing end marker or a truncated trailing statement is always an error.
 *
 * Pure logic — no database access.
 */

import { BACKUP_MAGIC, END_MARKER, sha256Hex, type BackupMetadata } from './format'
import type { ParsedBackup } from './parse'

export interface MetadataExtraction {
  metadata: BackupMetadata | null
  /** Index of the first character AFTER the metadata line's newline — the
   *  start of the byte range contentSha256 covers. 0 when no metadata. */
  bodyOffset: number
  error?: string
}

/** Find the first `-- {...}` line and parse it as the metadata JSON. */
export function extractMetadata(content: string): MetadataExtraction {
  let lineStart = 0
  while (lineStart <= content.length) {
    const lineEnd = content.indexOf('\n', lineStart)
    const end = lineEnd === -1 ? content.length : lineEnd
    const line = content.slice(lineStart, end)
    if (line.startsWith('-- {')) {
      try {
        const metadata = JSON.parse(line.slice(3)) as BackupMetadata
        return { metadata, bodyOffset: lineEnd === -1 ? content.length : lineEnd + 1 }
      } catch {
        return { metadata: null, bodyOffset: 0, error: 'Could not parse backup metadata' }
      }
    }
    if (lineEnd === -1) break
    lineStart = end + 1
  }
  return { metadata: null, bodyOffset: 0, error: 'No metadata found in backup file' }
}

/** sha256 of everything after the metadata line — the v3 integrity hash. */
export function computeContentChecksum(content: string, bodyOffset: number): string {
  return sha256Hex(content.slice(bodyOffset))
}

const DANGEROUS_PATTERNS = [
  { pattern: /DROP\s+DATABASE/i, name: 'DROP DATABASE' },
  { pattern: /DROP\s+SCHEMA/i, name: 'DROP SCHEMA' },
  { pattern: /DROP\s+ROLE/i, name: 'DROP ROLE' },
  { pattern: /ALTER\s+USER/i, name: 'ALTER USER' },
  { pattern: /ALTER\s+DATABASE/i, name: 'ALTER DATABASE' },
  { pattern: /CREATE\s+USER/i, name: 'CREATE USER' },
  { pattern: /CREATE\s+ROLE/i, name: 'CREATE ROLE' },
  { pattern: /CREATE\s+FUNCTION/i, name: 'CREATE FUNCTION' },
  { pattern: /GRANT\s+SUPER/i, name: 'GRANT SUPER' },
  { pattern: /CREATE\s+EXTENSION/i, name: 'CREATE EXTENSION' },
  { pattern: /\bTRUNCATE\b/i, name: 'TRUNCATE' },
  { pattern: /\bCOPY\s+(TO|FROM)\b/i, name: 'COPY TO/FROM' },
]

const IDENT = '[A-Za-z_][A-Za-z0-9_]*'
const INSERT_SHAPE = new RegExp(`^INSERT\\s+INTO\\s+"${IDENT}"\\s*\\(`, 'i')
const DELETE_SHAPE = new RegExp(`^DELETE\\s+FROM\\s+"${IDENT}"$`, 'i')
const DROP_SHAPE = new RegExp(`^DROP\\s+TABLE\\s+IF\\s+EXISTS\\s+"${IDENT}"\\s+CASCADE$`, 'i')

/** Shapes the exporter legitimately emits into the `other` bucket. */
const KNOWN_OTHER_SHAPES = [
  // FK restoration (v3): single-line ALTER TABLE ... ADD CONSTRAINT
  new RegExp(`^ALTER\\s+TABLE\\s+"${IDENT}"\\s+ADD\\s+CONSTRAINT\\s+`, 'i'),
  // Sequence-reset DO blocks (v2.1 and v3)
  /^DO\s+\$[A-Za-z_]*\$/i,
]

export interface ValidationResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
  metadata: BackupMetadata | null
  /** true only for v3+ files whose contentSha256 matched the file bytes. */
  checksumVerified: boolean
}

export function validateBackup(content: string, parsed: ParsedBackup): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  let checksumVerified = false

  // 1. Magic
  if (!content.includes(BACKUP_MAGIC)) {
    errors.push('Not a valid ARI backup file')
  }

  // 2. Metadata
  const { metadata, bodyOffset, error: metadataError } = extractMetadata(content)
  if (metadataError === 'Could not parse backup metadata') {
    errors.push(metadataError)
  } else if (metadataError) {
    warnings.push(metadataError)
  }
  let version = NaN
  if (metadata) {
    if (!metadata.version || !metadata.timestamp || !metadata.tables) {
      errors.push('Invalid backup metadata structure')
    }
    version = parseFloat(metadata.version)
    if (isNaN(version) || version < 1.0) {
      warnings.push(`Old or invalid backup version (${metadata.version}), some features may not work`)
    }
  }

  // 3. End marker — both v2.1 and v3 emit it; absence means truncation.
  if (!content.includes(END_MARKER)) {
    errors.push('Backup file is truncated or incomplete: missing end-of-backup marker')
  }

  // 4. Truncated trailing statement
  if (parsed.trailingContent) {
    errors.push('Backup file is truncated: incomplete trailing statement')
  }

  // 5. Byte-level checksum (v3+)
  if (metadata && version >= 3) {
    if (!metadata.contentSha256) {
      errors.push('Backup metadata is missing contentSha256 (required for this format version)')
    } else if (computeContentChecksum(content, bodyOffset) !== metadata.contentSha256) {
      errors.push(
        'Backup content checksum mismatch — the file was modified or corrupted after export. ' +
          'Note that any edit (including editor line-ending changes) invalidates the checksum.'
      )
    } else {
      checksumVerified = true
    }
  } else if (metadata) {
    warnings.push('Legacy backup format (pre-v3): no content checksum, integrity verified by row counts only')
  }

  // 6. Dangerous patterns — parsed non-INSERT statements only. Row data is
  //    never scanned; skipped statements are never executed.
  const executableNonInserts = [
    ...parsed.drops,
    ...parsed.creates,
    ...parsed.deletes,
    ...parsed.indexes,
    ...parsed.other,
  ]
  for (const statement of executableNonInserts) {
    for (const { pattern, name } of DANGEROUS_PATTERNS) {
      if (pattern.test(statement)) {
        errors.push(`Potentially dangerous SQL pattern detected: ${name}`)
      }
    }
  }

  // 7. Shape checks on executed statements (defense-in-depth)
  for (const statement of parsed.inserts) {
    if (!INSERT_SHAPE.test(statement)) {
      errors.push(`Malformed INSERT statement: ${statement.slice(0, 80)}`)
    }
  }
  for (const statement of parsed.deletes) {
    if (!DELETE_SHAPE.test(statement)) {
      errors.push(`Malformed DELETE statement: ${statement.slice(0, 80)}`)
    }
  }
  for (const statement of parsed.drops) {
    if (!DROP_SHAPE.test(statement)) {
      errors.push(`Malformed DROP statement: ${statement.slice(0, 80)}`)
    }
  }
  for (const statement of parsed.other) {
    if (!KNOWN_OTHER_SHAPES.some((shape) => shape.test(statement))) {
      warnings.push(`Unrecognized statement will run last: ${statement.slice(0, 80)}`)
    }
  }

  // 8. Content presence
  if (parsed.creates.length === 0 && parsed.inserts.length === 0) {
    errors.push('Backup file must contain table definitions or data')
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    metadata,
    checksumVerified,
  }
}
