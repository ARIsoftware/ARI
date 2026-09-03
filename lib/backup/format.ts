/**
 * Backup file format: shared constants, metadata shape, and file assembly.
 *
 * Format v3 contract (produced by export, enforced by validate):
 * - The file starts with a human-readable comment header.
 * - One line `-- {json}` carries the machine-readable metadata, including
 *   `contentSha256` — the SHA-256 of every byte AFTER that line. Any
 *   truncation or modification of the executable portion is detectable.
 * - Every SQL statement is exactly one line ending in `;` (see serialize.ts).
 * - The file ends with the END_MARKER comment line.
 *
 * Pure logic — no database access. Keep it that way: this module is fully
 * unit-tested and sits inside the coverage ratchet.
 */

import crypto from 'crypto'

export const BACKUP_VERSION = '3.0'

/** Magic substring every ARI backup contains (v2.1 and v3 alike). */
export const BACKUP_MAGIC = 'ARI Database Backup'

/** Final line of every backup — a deterministic truncation tripwire. */
export const END_MARKER = '-- End of backup'

export interface BackupMetadata {
  version: string
  timestamp: string
  tables: string[]
  rowCounts?: Record<string, number>
  totalRows?: number
  /** Per-table sha256(JSON.stringify(rows)) — informational/diagnostic only.
   *  Never verified on import: it depends on node-pg type parsers and row
   *  order. Integrity is proven by contentSha256 + in-transaction row counts. */
  checksums?: Record<string, string>
  /** v3+: sha256 hex of every byte after the metadata line. */
  contentSha256?: string
  exportedBy?: string
  discoveryMethod?: string
  warnings?: string[]
  errors?: string[]
  exportedFrom?: string
}

export class BackupFormatError extends Error {}

/** SHA-256 hex digest of a UTF-8 string. */
export function sha256Hex(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex')
}

/** SHA-256 checksum of JSON-serialized data. Used for per-table checksums. */
export function calculateChecksum(data: unknown): string {
  return sha256Hex(JSON.stringify(data))
}

/**
 * Strip NUL characters from a string. PostgreSQL rejects U+0000 in text
 * and JSONB columns, so any value containing NUL would produce a backup
 * that cannot be re-imported.
 */
export function stripNul(s: string): string {
  return s.replace(/\0/g, '')
}

/**
 * Assemble the final backup file: header + metadata line + body.
 *
 * The body is everything after the metadata line — all executable SQL plus
 * the END_MARKER — and is exactly the byte range `contentSha256` covers.
 * The header above the metadata line is cosmetic and unhashed by
 * construction (the hash cannot cover its own container line).
 */
export function assembleBackupFile(
  header: string,
  metadata: Omit<BackupMetadata, 'contentSha256'>,
  body: string,
): string {
  if (!header.endsWith('\n')) {
    throw new BackupFormatError('Backup header must end with a newline')
  }
  if (!body.trimEnd().endsWith(END_MARKER)) {
    throw new BackupFormatError(`Backup body must end with "${END_MARKER}"`)
  }
  const withChecksum: BackupMetadata = { ...metadata, contentSha256: sha256Hex(body) }
  return `${header}-- Backup Metadata (DO NOT MODIFY)\n-- ${JSON.stringify(withChecksum)}\n${body}`
}
