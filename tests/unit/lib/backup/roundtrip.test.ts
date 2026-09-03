import { describe, it, expect } from 'vitest'
import { END_MARKER, assembleBackupFile, stripNul } from '@/lib/backup/format'
import { buildInsertStatements, escapeStringLiteral } from '@/lib/backup/serialize'
import { classifyStatement, parseBackup, splitSqlStatements } from '@/lib/backup/parse'
import { validateBackup } from '@/lib/backup/validate'

/**
 * Test-local inverse of escapeStringLiteral. Lives here (outside coverage
 * scope) purely to prove decode(escape(s)) === stripNul(s).
 */
function decodeELiteral(literal: string): string {
  expect(literal.startsWith("E'")).toBe(true)
  expect(literal.endsWith("'")).toBe(true)
  const inner = literal.slice(2, -1)
  let out = ''
  let i = 0
  while (i < inner.length) {
    const ch = inner[i]
    if (ch === '\\') {
      const next = inner[i + 1]
      if (next === 'n') out += '\n'
      else if (next === 'r') out += '\r'
      else if (next === 't') out += '\t'
      else out += next // an escaped backslash
      i += 2
    } else if (ch === "'") {
      out += "'" // must be a '' escape
      i += 2
    } else {
      out += ch
      i++
    }
  }
  return out
}

const NASTY_STRINGS = [
  'multi-line with\n-- fake comment line\nand a line ending ;\ndone',
  '\');DROP TABLE "user";--',
  "it's got apostrophes''",
  'tabs\tand\r\nCRLF',
  'back\\slash \\n literal',
  'unicode 🎉 café Ω',
  'nul\0char',
  '$$ dollar quote bait $body$',
  '',
  '   leading and trailing   ',
]

const NASTY_ROWS = [
  {
    id: '1',
    body: NASTY_STRINGS[0],
    injection: NASTY_STRINGS[1],
    tags: ["it's", 'multi\nline', '', 'has "quotes"'],
    empty_tags: [] as string[],
    score_x: NaN,
    score_y: Infinity,
    meta: { nested: 'quote \' and\nnewline', arr: [1, { deep: '$$' }], text: 'he said "hi"' },
    created_at: new Date('2026-02-03T04:05:06.789Z'),
    flag: true,
    nothing: null,
  },
  {
    id: '2',
    body: NASTY_STRINGS[7],
    injection: NASTY_STRINGS[6],
    tags: [null, 'x'] as (string | null)[],
    empty_tags: [] as string[],
    score_x: -Infinity,
    score_y: 0.5,
    meta: { plain: true },
    created_at: new Date('2026-02-03T04:05:06.789Z'),
    flag: false,
    nothing: null,
  },
]

describe('escape/decode round-trip', () => {
  it('decode(escape(s)) === stripNul(s) for the whole nasty corpus', () => {
    for (const s of NASTY_STRINGS) {
      expect(decodeELiteral(escapeStringLiteral(s))).toBe(stripNul(s))
    }
  })
})

describe('serialize → parse round-trip', () => {
  it('splits serialized INSERTs back into exactly the emitted statements', () => {
    const statements = buildInsertStatements('nasty', NASTY_ROWS as Record<string, unknown>[])
    expect(statements.length).toBeGreaterThan(0)
    const doc = statements.join('\n')
    const { statements: reparsed, trailingContent } = splitSqlStatements(doc)
    expect(trailingContent).toBe('')
    expect(reparsed).toHaveLength(statements.length)
    for (let i = 0; i < statements.length; i++) {
      // The parser strips the trailing semicolon; everything else survives verbatim.
      expect(reparsed[i]).toBe(statements[i].slice(0, -1))
      expect(classifyStatement(reparsed[i])).toBe('insert')
    }
  })

  it('emits identical tuples whether rows are serialized in one batch or page by page', () => {
    const batched = buildInsertStatements('nasty', NASTY_ROWS as Record<string, unknown>[])
    const paged = NASTY_ROWS.flatMap((row) =>
      buildInsertStatements('nasty', [row] as Record<string, unknown>[])
    )
    const valuesOf = (statements: string[]): string =>
      statements.map((s) => s.slice(s.indexOf('VALUES ') + 'VALUES '.length, -1)).join(', ')
    expect(valuesOf(batched)).toBe(valuesOf(paged))
  })
})

describe('full-document round-trip', () => {
  it('assembles, parses, and validates a complete v3 backup containing nasty data', () => {
    const inserts = buildInsertStatements('nasty', NASTY_ROWS as Record<string, unknown>[])
    const body = [
      'BEGIN;',
      "SET session_replication_role = 'replica';",
      'DROP TABLE IF EXISTS "nasty" CASCADE;',
      'CREATE TABLE "nasty" ("id" TEXT PRIMARY KEY);',
      'DELETE FROM "nasty";',
      ...inserts,
      'CREATE INDEX IF NOT EXISTS idx_nasty_id ON "nasty"("id");',
      'ALTER TABLE "nasty" ADD CONSTRAINT nasty_fk FOREIGN KEY ("id") REFERENCES "user"("id");',
      'DO $$ BEGIN NULL; END $$;',
      "SET session_replication_role = 'origin';",
      'COMMIT;',
      END_MARKER,
      '',
    ].join('\n')
    const doc = assembleBackupFile(
      '-- ARI Database Backup v3\n',
      { version: '3.0', timestamp: '2026-01-01T00:00:00.000Z', tables: ['nasty'], rowCounts: { nasty: 2 } },
      body
    )

    const parsed = parseBackup(doc)
    expect(parsed.trailingContent).toBe('')
    expect(parsed.drops).toHaveLength(1)
    expect(parsed.creates).toHaveLength(1)
    expect(parsed.deletes).toHaveLength(1)
    expect(parsed.inserts).toHaveLength(inserts.length)
    expect(parsed.indexes).toHaveLength(1)
    expect(parsed.other).toHaveLength(2)

    const result = validateBackup(doc, parsed)
    expect(result.errors).toEqual([])
    expect(result.isValid).toBe(true)
    expect(result.checksumVerified).toBe(true)
    // The injection-bait string survives inside its literal, classified as data
    expect(parsed.inserts.join('\n')).toContain('DROP TABLE "user"')
  })

  it('parses and validates a realistic legacy v2.1 document, preserving multi-line literals', () => {
    const multiLineValue = 'first line\n-- looks like a comment\n\nends with a semicolon;\nlast line'
    const doc = [
      '-- ================================================================',
      '-- ARI Database Backup v2.1',
      '-- Generated: 2026-01-01T00:00:00.000Z',
      '-- ================================================================',
      '',
      '-- Backup Metadata (DO NOT MODIFY)',
      `-- ${JSON.stringify({ version: '2.1', timestamp: '2026-01-01T00:00:00.000Z', tables: ['journal'], rowCounts: { journal: 1 } })}`,
      '',
      'BEGIN;',
      "SET session_replication_role = 'replica';",
      '-- Table: journal',
      'DROP TABLE IF EXISTS "journal" CASCADE;',
      'CREATE TABLE "journal" (',
      '  "id" UUID DEFAULT gen_random_uuid() NOT NULL,',
      '  "body" TEXT,',
      '  PRIMARY KEY ("id")',
      ');',
      '',
      '-- Insert data',
      'DELETE FROM "journal";',
      `INSERT INTO "journal" ("id", "body") VALUES ('a-1', '${multiLineValue}');`,
      '',
      `DO $$ BEGIN IF pg_get_serial_sequence('"journal"', 'id') IS NOT NULL THEN PERFORM setval(pg_get_serial_sequence('"journal"', 'id'), 1, false); END IF; END $$;`,
      '',
      "SET session_replication_role = 'origin';",
      'COMMIT;',
      '',
      END_MARKER,
      '',
    ].join('\n')

    const parsed = parseBackup(doc)
    expect(parsed.trailingContent).toBe('')
    expect(parsed.inserts).toHaveLength(1)
    // The multi-line literal survives byte-for-byte inside its statement
    expect(parsed.inserts[0]).toContain(multiLineValue)
    expect(parsed.creates).toHaveLength(1)
    expect(parsed.other).toHaveLength(1) // the setval DO-block

    const result = validateBackup(doc, parsed)
    expect(result.errors).toEqual([])
    expect(result.isValid).toBe(true)
    expect(result.checksumVerified).toBe(false)
    expect(result.warnings.some((w) => w.includes('Legacy backup format'))).toBe(true)
  })
})
