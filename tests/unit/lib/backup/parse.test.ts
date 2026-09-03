import { describe, it, expect } from 'vitest'
import { classifyStatement, parseBackup, splitSqlStatements } from '@/lib/backup/parse'

describe('splitSqlStatements', () => {
  it('splits simple statements and ignores comments between them', () => {
    const result = splitSqlStatements('SELECT 1;\n-- a comment\nSELECT 2;\n')
    expect(result.statements).toEqual(['SELECT 1', 'SELECT 2'])
    expect(result.trailingContent).toBe('')
  })

  it('handles a comment at EOF without a trailing newline', () => {
    const result = splitSqlStatements('SELECT 1;\n-- trailing comment')
    expect(result.statements).toEqual(['SELECT 1'])
    expect(result.trailingContent).toBe('')
  })

  it('strips a same-line comment after a statement', () => {
    const result = splitSqlStatements('SELECT 1; -- note\nSELECT 2;')
    expect(result.statements).toEqual(['SELECT 1', 'SELECT 2'])
  })

  it('does not split on semicolons inside plain literals', () => {
    const result = splitSqlStatements("INSERT INTO t (a) VALUES ('a;b');")
    expect(result.statements).toEqual(["INSERT INTO t (a) VALUES ('a;b')"])
  })

  it('does not split on semicolons inside E-string literals with escaped quotes', () => {
    const result = splitSqlStatements("SELECT E'a\\';b';")
    expect(result.statements).toEqual(["SELECT E'a\\';b'"])
  })

  it('does not split on semicolons inside quoted identifiers', () => {
    const result = splitSqlStatements('SELECT "a;b" FROM t;')
    expect(result.statements).toEqual(['SELECT "a;b" FROM t'])
  })

  it('handles "" escapes inside quoted identifiers', () => {
    const result = splitSqlStatements('SELECT "a""b;c" FROM t;')
    expect(result.statements).toEqual(['SELECT "a""b;c" FROM t'])
  })

  it('does not split inside dollar-quoted blocks', () => {
    const result = splitSqlStatements('DO $$ BEGIN PERFORM 1; END $$;\nSELECT 2;')
    expect(result.statements).toEqual(['DO $$ BEGIN PERFORM 1; END $$', 'SELECT 2'])
  })

  it('handles named dollar-quote tags, ignoring different tags inside', () => {
    const result = splitSqlStatements('DO $body$ x; $tag$ y; $body$;')
    expect(result.statements).toEqual(['DO $body$ x; $tag$ y; $body$'])
  })

  it('treats a bare dollar sign as plain content', () => {
    const result = splitSqlStatements("SELECT 'price', $1 FROM t;")
    expect(result.statements).toEqual(["SELECT 'price', $1 FROM t"])
  })

  it('ignores semicolons inside block comments, including nested ones', () => {
    const result = splitSqlStatements('/* ; */ SELECT 1;\n/* outer /* inner ; */ still comment */ SELECT 2;')
    expect(result.statements).toEqual(['SELECT 1', 'SELECT 2'])
  })

  it('treats -- inside a literal as content, not a comment', () => {
    const sql = "INSERT INTO t (a) VALUES ('before -- not a comment after');"
    const result = splitSqlStatements(sql)
    expect(result.statements).toEqual(["INSERT INTO t (a) VALUES ('before -- not a comment after')"])
  })

  it('keeps multi-line legacy v2.1 literals intact (raw newlines, comment-looking and semicolon-ending lines)', () => {
    // Exactly what the old exporter wrote for multi-line user content.
    const value = 'line1\n-- looks like comment\n\nhas semicolon;\nend'
    const sql = `INSERT INTO "journal" ("body") VALUES ('${value}');\nSELECT 1;`
    const result = splitSqlStatements(sql)
    expect(result.statements).toHaveLength(2)
    expect(result.statements[0]).toBe(`INSERT INTO "journal" ("body") VALUES ('${value}')`)
    expect(result.trailingContent).toBe('')
  })

  it("handles '' escapes inside plain literals", () => {
    const result = splitSqlStatements("INSERT INTO t (a) VALUES ('it''s; not a split');")
    expect(result.statements).toEqual(["INSERT INTO t (a) VALUES ('it''s; not a split')"])
  })

  it('applies the E-prefix boundary rule (E glued to an identifier is not an E-string)', () => {
    // xE'…' — the quote follows E, but E is the tail of identifier xE, so the
    // literal is plain: backslash is content and the second quote closes it.
    const result = splitSqlStatements("SELECT xE'a\\';b';")
    expect(result.statements).toEqual(["SELECT xE'a\\'"])
    expect(result.trailingContent).toBe("b';")
  })

  it('reports a truncated final statement as trailingContent', () => {
    const result = splitSqlStatements("SELECT 1;\nINSERT INTO t (a) VALUES ('abc'")
    expect(result.statements).toEqual(['SELECT 1'])
    expect(result.trailingContent).toBe("INSERT INTO t (a) VALUES ('abc'")
  })

  it('reports an unterminated literal at EOF without hanging', () => {
    const result = splitSqlStatements("INSERT INTO t (a) VALUES ('never closed")
    expect(result.statements).toEqual([])
    expect(result.trailingContent).toBe("INSERT INTO t (a) VALUES ('never closed")
  })

  it('reports an unterminated dollar quote as trailingContent', () => {
    const result = splitSqlStatements('DO $$ BEGIN PERFORM 1;')
    expect(result.statements).toEqual([])
    expect(result.trailingContent).toBe('DO $$ BEGIN PERFORM 1;')
  })

  it('parses CRLF input identically to LF input', () => {
    const result = splitSqlStatements('SELECT 1;\r\nSELECT 2;\r\n')
    expect(result.statements).toEqual(['SELECT 1', 'SELECT 2'])
  })

  it('ignores empty statements from stray semicolons', () => {
    const result = splitSqlStatements(';;\nSELECT 1;\n;')
    expect(result.statements).toEqual(['SELECT 1'])
  })
})

describe('classifyStatement', () => {
  it('classifies every bucket, case-insensitively', () => {
    expect(classifyStatement('DROP TABLE IF EXISTS "x" CASCADE')).toBe('drop')
    expect(classifyStatement('drop table "y"')).toBe('drop')
    expect(classifyStatement('CREATE TABLE "x" (id TEXT)')).toBe('create')
    expect(classifyStatement('INSERT INTO "x" ("id") VALUES (1)')).toBe('insert')
    expect(classifyStatement('CREATE INDEX idx ON "x"("id")')).toBe('index')
    expect(classifyStatement('CREATE UNIQUE INDEX idx ON "x"("id")')).toBe('index')
    expect(classifyStatement('DELETE FROM "x"')).toBe('delete')
    expect(classifyStatement('BEGIN')).toBe('skipped')
    expect(classifyStatement('COMMIT')).toBe('skipped')
    expect(classifyStatement('ROLLBACK')).toBe('skipped')
    expect(classifyStatement("SET session_replication_role = 'replica'")).toBe('skipped')
    expect(classifyStatement('SELECT COUNT(*) FROM "x"')).toBe('skipped')
    expect(classifyStatement('DO $$ BEGIN NULL; END $$')).toBe('other')
    expect(classifyStatement('ALTER TABLE "x" ADD CONSTRAINT fk FOREIGN KEY ("a") REFERENCES "y"("id")')).toBe('other')
  })

  it('requires word boundaries (no false prefixes)', () => {
    expect(classifyStatement('CREATETABLE x')).toBe('other')
    expect(classifyStatement('INSERTINTO x')).toBe('other')
    expect(classifyStatement('SETTING x')).toBe('other')
    expect(classifyStatement('SELECTED x')).toBe('other')
  })
})

describe('parseBackup', () => {
  it('splits and buckets a whole document', () => {
    const doc = [
      'BEGIN;',
      "SET session_replication_role = 'replica';",
      'DROP TABLE IF EXISTS "tasks" CASCADE;',
      'CREATE TABLE "tasks" (id TEXT PRIMARY KEY);',
      'DELETE FROM "tasks";',
      'INSERT INTO "tasks" ("id") VALUES (E\'1\');',
      'CREATE INDEX IF NOT EXISTS idx ON "tasks"("id");',
      'ALTER TABLE "tasks" ADD CONSTRAINT fk FOREIGN KEY ("id") REFERENCES "u"("id");',
      'DO $$ BEGIN NULL; END $$;',
      'COMMIT;',
    ].join('\n')
    const parsed = parseBackup(doc)
    expect(parsed.drops).toHaveLength(1)
    expect(parsed.creates).toHaveLength(1)
    expect(parsed.deletes).toHaveLength(1)
    expect(parsed.inserts).toHaveLength(1)
    expect(parsed.indexes).toHaveLength(1)
    expect(parsed.other).toHaveLength(2)
    expect(parsed.skipped).toHaveLength(3)
    expect(parsed.trailingContent).toBe('')
  })

  it('surfaces trailing content from a truncated document', () => {
    const parsed = parseBackup('SELECT 1;\nINSERT INTO "t" ("a") VALUES (')
    expect(parsed.trailingContent).toBe('INSERT INTO "t" ("a") VALUES (')
  })
})
