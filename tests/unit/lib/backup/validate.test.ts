import { describe, it, expect } from 'vitest'
import crypto from 'node:crypto'
import { END_MARKER, assembleBackupFile } from '@/lib/backup/format'
import { parseBackup } from '@/lib/backup/parse'
import { computeContentChecksum, extractMetadata, validateBackup } from '@/lib/backup/validate'

const TIMESTAMP = '2026-01-01T00:00:00.000Z'
const HEADER = '-- ================\n-- ARI Database Backup v3\n-- ================\n'

const BODY = [
  'BEGIN;',
  "SET session_replication_role = 'replica';",
  'DROP TABLE IF EXISTS "tasks" CASCADE;',
  'CREATE TABLE "tasks" ("id" TEXT PRIMARY KEY);',
  'DELETE FROM "tasks";',
  'INSERT INTO "tasks" ("id") VALUES (E\'1\');',
  'CREATE INDEX IF NOT EXISTS idx_tasks_id ON "tasks"("id");',
  'ALTER TABLE "tasks" ADD CONSTRAINT tasks_fk FOREIGN KEY ("id") REFERENCES "user"("id");',
  'DO $$ BEGIN NULL; END $$;',
  "SET session_replication_role = 'origin';",
  'COMMIT;',
  END_MARKER,
  '',
].join('\n')

function v3Doc(body: string = BODY): string {
  return assembleBackupFile(HEADER, { version: '3.0', timestamp: TIMESTAMP, tables: ['tasks'] }, body)
}

function validate(content: string) {
  return validateBackup(content, parseBackup(content))
}

describe('extractMetadata', () => {
  it('finds and parses the first metadata line, with a correct bodyOffset', () => {
    const doc = v3Doc()
    const { metadata, bodyOffset, error } = extractMetadata(doc)
    expect(error).toBeUndefined()
    expect(metadata?.version).toBe('3.0')
    expect(metadata?.tables).toEqual(['tasks'])
    expect(doc.slice(bodyOffset)).toBe(BODY)
  })

  it('parses metadata containing nested braces', () => {
    const doc = '-- header\n-- {"version":"3.0","timestamp":"t","tables":["a"],"rowCounts":{"a":1}}\nbody'
    const { metadata } = extractMetadata(doc)
    expect(metadata?.rowCounts).toEqual({ a: 1 })
  })

  it('reports missing metadata', () => {
    const { metadata, error } = extractMetadata('-- just comments\nSELECT 1;\n')
    expect(metadata).toBeNull()
    expect(error).toBe('No metadata found in backup file')
  })

  it('reports malformed metadata JSON', () => {
    const { metadata, error } = extractMetadata('-- {not json}\n')
    expect(metadata).toBeNull()
    expect(error).toBe('Could not parse backup metadata')
  })

  it('handles a metadata line at EOF without a trailing newline', () => {
    const { metadata, bodyOffset } = extractMetadata('-- {"version":"3.0"}')
    expect(metadata?.version).toBe('3.0')
    expect(bodyOffset).toBe('-- {"version":"3.0"}'.length)
  })
})

describe('computeContentChecksum', () => {
  it('hashes only the bytes after the offset', () => {
    const content = 'HEADER\nBODY'
    const offset = 'HEADER\n'.length
    const reference = crypto.createHash('sha256').update('BODY').digest('hex')
    expect(computeContentChecksum(content, offset)).toBe(reference)
    // Header changes do not affect it; body changes do
    expect(computeContentChecksum('XEADER\nBODY', offset)).toBe(reference)
    expect(computeContentChecksum('HEADER\nBODy', offset)).not.toBe(reference)
  })
})

describe('validateBackup', () => {
  it('accepts a well-formed v3 file with a verified checksum', () => {
    const result = validate(v3Doc())
    expect(result.errors).toEqual([])
    expect(result.isValid).toBe(true)
    expect(result.checksumVerified).toBe(true)
    expect(result.metadata?.version).toBe('3.0')
  })

  it('rejects a v3 file missing contentSha256', () => {
    const doc = `${HEADER}-- ${JSON.stringify({ version: '3.0', timestamp: TIMESTAMP, tables: ['tasks'] })}\n${BODY}`
    const result = validate(doc)
    expect(result.isValid).toBe(false)
    expect(result.errors.some((e) => e.includes('contentSha256'))).toBe(true)
  })

  it('rejects a v3 file whose body was modified after export', () => {
    const tampered = v3Doc().replace("VALUES (E'1')", "VALUES (E'2')")
    const result = validate(tampered)
    expect(result.isValid).toBe(false)
    expect(result.errors.some((e) => e.includes('checksum mismatch'))).toBe(true)
    expect(result.checksumVerified).toBe(false)
  })

  it('accepts a legacy v2.1 file with a warning instead of a checksum', () => {
    const body = ['CREATE TABLE "tasks" ("id" TEXT);', 'INSERT INTO "tasks" ("id") VALUES (\'1\');', END_MARKER, ''].join('\n')
    const doc = `-- ARI Database Backup v2.1\n-- ${JSON.stringify({ version: '2.1', timestamp: TIMESTAMP, tables: ['tasks'] })}\n${body}`
    const result = validate(doc)
    expect(result.isValid).toBe(true)
    expect(result.checksumVerified).toBe(false)
    expect(result.warnings.some((w) => w.includes('Legacy backup format'))).toBe(true)
  })

  it('rejects a file without the ARI magic string', () => {
    const result = validate(`-- some dump\nCREATE TABLE "t" ("id" TEXT);\n${END_MARKER}\n`)
    expect(result.errors).toContain('Not a valid ARI backup file')
  })

  it('warns (not errors) when metadata is absent entirely', () => {
    const result = validate(`-- ARI Database Backup\nCREATE TABLE "t" ("id" TEXT);\n${END_MARKER}\n`)
    expect(result.warnings).toContain('No metadata found in backup file')
    expect(result.isValid).toBe(true)
  })

  it('errors on unparseable metadata JSON', () => {
    const result = validate(`-- ARI Database Backup\n-- {broken\nCREATE TABLE "t" ("id" TEXT);\n${END_MARKER}\n`)
    expect(result.errors).toContain('Could not parse backup metadata')
  })

  it('errors on metadata missing required fields', () => {
    const doc = `-- ARI Database Backup\n-- ${JSON.stringify({ version: '2.1' })}\nCREATE TABLE "t" ("id" TEXT);\n${END_MARKER}\n`
    const result = validate(doc)
    expect(result.errors).toContain('Invalid backup metadata structure')
  })

  it('warns on an old version number', () => {
    const doc = `-- ARI Database Backup\n-- ${JSON.stringify({ version: '0.5', timestamp: TIMESTAMP, tables: [] })}\nCREATE TABLE "t" ("id" TEXT);\n${END_MARKER}\n`
    const result = validate(doc)
    expect(result.warnings.some((w) => w.includes('Old or invalid backup version'))).toBe(true)
  })

  it('rejects a file missing the end-of-backup marker', () => {
    const body = 'CREATE TABLE "tasks" ("id" TEXT);\nINSERT INTO "tasks" ("id") VALUES (E\'1\');\n'
    const doc = `-- ARI Database Backup v2.1\n-- ${JSON.stringify({ version: '2.1', timestamp: TIMESTAMP, tables: ['tasks'] })}\n${body}`
    const result = validate(doc)
    expect(result.errors.some((e) => e.includes('missing end-of-backup marker'))).toBe(true)
  })

  it('rejects a file with a truncated trailing statement', () => {
    const body = `CREATE TABLE "tasks" ("id" TEXT);\n${END_MARKER}\nINSERT INTO "tasks" ("id") VALUES (E'cut`
    const doc = `-- ARI Database Backup v2.1\n-- ${JSON.stringify({ version: '2.1', timestamp: TIMESTAMP, tables: ['tasks'] })}\n${body}`
    const result = validate(doc)
    expect(result.errors.some((e) => e.includes('incomplete trailing statement'))).toBe(true)
  })

  it('never flags dangerous keywords inside INSERT row data', () => {
    // The headline regression: user content mentioning TRUNCATE / COPY FROM /
    // DROP DATABASE / CREATE FUNCTION must not block a restore.
    const inserts = [
      'INSERT INTO "tasks" ("title") VALUES (E\'Truncate old logs\');',
      'INSERT INTO "notes" ("body") VALUES (E\'please COPY FROM the shared doc\');',
      'INSERT INTO "notes" ("body") VALUES (E\'how to DROP DATABASE safely\');',
      'INSERT INTO "notes" ("body") VALUES (E\'CREATE FUNCTION tutorial\');',
    ].join('\n')
    const body = `CREATE TABLE "tasks" ("title" TEXT);\n${inserts}\n${END_MARKER}\n`
    const doc = `-- ARI Database Backup v2.1\n-- ${JSON.stringify({ version: '2.1', timestamp: TIMESTAMP, tables: ['tasks'] })}\n${body}`
    const result = validate(doc)
    expect(result.errors).toEqual([])
    expect(result.isValid).toBe(true)
  })

  it('still rejects dangerous statements that would actually execute', () => {
    const body = `CREATE TABLE "tasks" ("id" TEXT);\nINSERT INTO "tasks" ("id") VALUES (E'1');\nTRUNCATE tasks;\n${END_MARKER}\n`
    const doc = `-- ARI Database Backup v2.1\n-- ${JSON.stringify({ version: '2.1', timestamp: TIMESTAMP, tables: ['tasks'] })}\n${body}`
    const result = validate(doc)
    expect(result.errors).toContain('Potentially dangerous SQL pattern detected: TRUNCATE')
  })

  it('rejects malformed INSERT / DELETE / DROP shapes', () => {
    const body = [
      'CREATE TABLE "tasks" ("id" TEXT);',
      'INSERT INTO tasks VALUES (1);', // unquoted table
      'DELETE FROM "tasks" WHERE 1=1;', // trailing clause
      'DROP TABLE "tasks";', // no IF EXISTS ... CASCADE
      END_MARKER,
      '',
    ].join('\n')
    const doc = `-- ARI Database Backup v2.1\n-- ${JSON.stringify({ version: '2.1', timestamp: TIMESTAMP, tables: ['tasks'] })}\n${body}`
    const result = validate(doc)
    expect(result.errors.some((e) => e.startsWith('Malformed INSERT'))).toBe(true)
    expect(result.errors.some((e) => e.startsWith('Malformed DELETE'))).toBe(true)
    expect(result.errors.some((e) => e.startsWith('Malformed DROP'))).toBe(true)
  })

  it('whitelists FK ALTERs and DO-blocks in other; unknown statements warn but do not fail', () => {
    const body = [
      'CREATE TABLE "tasks" ("id" TEXT);',
      'INSERT INTO "tasks" ("id") VALUES (E\'1\');',
      'ALTER TABLE "tasks" ADD CONSTRAINT fk FOREIGN KEY ("id") REFERENCES "user"("id");',
      'DO $$ BEGIN NULL; END $$;',
      'COMMENT ON TABLE "tasks" IS E\'something unforeseen\';',
      END_MARKER,
      '',
    ].join('\n')
    const doc = `-- ARI Database Backup v2.1\n-- ${JSON.stringify({ version: '2.1', timestamp: TIMESTAMP, tables: ['tasks'] })}\n${body}`
    const result = validate(doc)
    expect(result.isValid).toBe(true)
    const unrecognized = result.warnings.filter((w) => w.startsWith('Unrecognized statement'))
    expect(unrecognized).toHaveLength(1)
    expect(unrecognized[0]).toContain('COMMENT ON TABLE')
  })

  it('rejects a file with no tables and no data', () => {
    const doc = `-- ARI Database Backup\n-- ${JSON.stringify({ version: '2.1', timestamp: TIMESTAMP, tables: [] })}\nSELECT 1;\n${END_MARKER}\n`
    const result = validate(doc)
    expect(result.errors).toContain('Backup file must contain table definitions or data')
  })
})
