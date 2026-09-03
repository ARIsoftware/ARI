import { describe, it, expect } from 'vitest'
import {
  BackupSerializeError,
  buildInsertStatements,
  escapeStringLiteral,
  serializeArray,
  serializeValue,
} from '@/lib/backup/serialize'

const hasRawLineBreak = (s: string): boolean => s.includes('\n') || s.includes('\r')

describe('escapeStringLiteral', () => {
  it('wraps plain text in an E-literal', () => {
    expect(escapeStringLiteral('')).toBe("E''")
    expect(escapeStringLiteral('plain text')).toBe("E'plain text'")
  })

  it('escapes each special character', () => {
    expect(escapeStringLiteral('a\nb')).toBe("E'a\\nb'")
    expect(escapeStringLiteral('a\rb')).toBe("E'a\\rb'")
    expect(escapeStringLiteral('a\tb')).toBe("E'a\\tb'")
    expect(escapeStringLiteral('a\\b')).toBe("E'a\\\\b'")
    expect(escapeStringLiteral("it's")).toBe("E'it''s'")
  })

  it('distinguishes a real newline from a literal backslash-n', () => {
    // Real newline → \n escape; the two-char sequence \n → \\n (backslash survives)
    expect(escapeStringLiteral('a\nb')).toBe("E'a\\nb'")
    expect(escapeStringLiteral('a\\nb')).toBe("E'a\\\\nb'")
  })

  it('handles quotes and backslashes at string edges', () => {
    expect(escapeStringLiteral("'")).toBe("E''''")
    expect(escapeStringLiteral("''")).toBe("E''''''")
    expect(escapeStringLiteral('trailing\\')).toBe("E'trailing\\\\'")
    expect(escapeStringLiteral("trailing'")).toBe("E'trailing'''")
  })

  it('handles CRLF sequences', () => {
    expect(escapeStringLiteral('a\r\nb')).toBe("E'a\\r\\nb'")
  })

  it('strips NUL characters', () => {
    expect(escapeStringLiteral('a\0b')).toBe("E'ab'")
    expect(escapeStringLiteral('\0')).toBe("E''")
  })

  it('passes Unicode through raw, including line separators', () => {
    expect(escapeStringLiteral('🎉 café')).toBe("E'🎉 café'")
    const lineSep = String.fromCharCode(0x2028)
    expect(escapeStringLiteral(`a${lineSep}b`)).toBe(`E'a${lineSep}b'`)
  })

  it('never emits a raw newline or carriage return', () => {
    const nasty = ['a\nb', 'a\r\nb', 'x\n\n\ny', '\\\n', "';\n--"]
    for (const s of nasty) {
      expect(hasRawLineBreak(escapeStringLiteral(s))).toBe(false)
    }
  })
})

describe('serializeValue', () => {
  it('serializes null and undefined as NULL', () => {
    expect(serializeValue(null)).toBe('NULL')
    expect(serializeValue(undefined)).toBe('NULL')
  })

  it('serializes booleans', () => {
    expect(serializeValue(true)).toBe('TRUE')
    expect(serializeValue(false)).toBe('FALSE')
  })

  it('serializes finite numbers bare', () => {
    expect(serializeValue(0)).toBe('0')
    expect(serializeValue(-0)).toBe('0')
    expect(serializeValue(1.5)).toBe('1.5')
    expect(serializeValue(-42)).toBe('-42')
    expect(serializeValue(Number.MAX_SAFE_INTEGER)).toBe('9007199254740991')
  })

  it('serializes non-finite numbers as quoted literals without a cast', () => {
    expect(serializeValue(NaN)).toBe("'NaN'")
    expect(serializeValue(Infinity)).toBe("'Infinity'")
    expect(serializeValue(-Infinity)).toBe("'-Infinity'")
  })

  it('serializes strings as E-literals, keeping numeric-looking strings quoted', () => {
    expect(serializeValue('hello')).toBe("E'hello'")
    expect(serializeValue('123')).toBe("E'123'")
  })

  it('serializes Dates as their ISO string', () => {
    const d = new Date('2026-01-02T03:04:05.678Z')
    expect(serializeValue(d)).toBe("E'2026-01-02T03:04:05.678Z'")
  })

  it('serializes Buffers as bytea hex input', () => {
    expect(serializeValue(Buffer.from('hello'))).toBe("'\\x68656c6c6f'")
    expect(serializeValue(Buffer.alloc(0))).toBe("'\\x'")
  })

  it('serializes plain objects as the exact JSON.stringify text with no cast', () => {
    const obj = { a: 'he said "hi"\nline2', b: [1, { c: "d'e" }] }
    const out = serializeValue(obj)
    expect(out).toBe(escapeStringLiteral(JSON.stringify(obj)))
    expect(out.startsWith("E'")).toBe(true)
    expect(out.includes('::jsonb')).toBe(false)
    expect(hasRawLineBreak(out)).toBe(false)
  })

  it('routes arrays through serializeArray', () => {
    expect(serializeValue(['a'])).toBe("ARRAY[E'a']")
  })

  it('coerces exotic primitives via String', () => {
    expect(serializeValue(BigInt(42))).toBe("E'42'")
  })
})

describe('serializeArray', () => {
  it('serializes an empty array with an explicit text[] cast', () => {
    expect(serializeArray([])).toBe('ARRAY[]::text[]')
  })

  it('serializes string elements with full escaping (including apostrophes)', () => {
    expect(serializeArray(["it's"])).toBe("ARRAY[E'it''s']")
    expect(serializeArray(['has "quotes"', 'back\\slash', 'multi\nline'])).toBe(
      'ARRAY[E\'has "quotes"\',E\'back\\\\slash\',E\'multi\\nline\']'
    )
  })

  it('serializes null, undefined, empty-string, numeric, and boolean elements', () => {
    expect(serializeArray([null, 'x'])).toBe("ARRAY[NULL,E'x']")
    expect(serializeArray([undefined])).toBe('ARRAY[NULL]')
    expect(serializeArray([''])).toBe("ARRAY[E'']")
    expect(serializeArray([1, 2.5])).toBe('ARRAY[1,2.5]')
    expect(serializeArray([NaN])).toBe("ARRAY['NaN']")
    expect(serializeArray([true, false])).toBe('ARRAY[TRUE,FALSE]')
  })

  it('throws on nested arrays and object elements', () => {
    expect(() => serializeArray([['a']])).toThrow(BackupSerializeError)
    expect(() => serializeArray([{ a: 1 }])).toThrow(BackupSerializeError)
  })
})

describe('buildInsertStatements', () => {
  const tupleCount = (statement: string): number => statement.split('), (').length

  it('returns no statements for zero rows', () => {
    expect(buildInsertStatements('tasks', [])).toEqual([])
  })

  it('emits a single one-line statement with quoted (camelCase-safe) columns', () => {
    const rows = [{ id: 'u1', createdAt: new Date('2026-01-01T00:00:00.000Z'), disabled: false }]
    const out = buildInsertStatements('user', rows)
    expect(out).toHaveLength(1)
    expect(out[0]).toBe(
      'INSERT INTO "user" ("id", "createdAt", "disabled") VALUES (E\'u1\', E\'2026-01-01T00:00:00.000Z\', FALSE);'
    )
  })

  it('batches rows by batchSize', () => {
    const rows = Array.from({ length: 250 }, (_, i) => ({ id: String(i) }))
    const out = buildInsertStatements('tasks', rows, { batchSize: 100 })
    expect(out).toHaveLength(3)
    expect(tupleCount(out[0])).toBe(100)
    expect(tupleCount(out[1])).toBe(100)
    expect(tupleCount(out[2])).toBe(50)
  })

  it('flushes early when a batch exceeds maxBatchBytes', () => {
    const rows = Array.from({ length: 4 }, (_, i) => ({ id: String(i), blob: 'x'.repeat(100) }))
    const out = buildInsertStatements('tasks', rows, { batchSize: 100, maxBatchBytes: 250 })
    expect(out.length).toBeGreaterThan(1)
    const totalTuples = out.reduce((sum, s) => sum + tupleCount(s), 0)
    expect(totalTuples).toBe(4)
  })

  it('emits a single oversized row alone rather than dropping it', () => {
    const rows = [{ id: '1', blob: 'y'.repeat(5000) }, { id: '2', blob: 'z' }]
    const out = buildInsertStatements('tasks', rows, { maxBatchBytes: 100 })
    expect(out).toHaveLength(2)
    expect(tupleCount(out[0])).toBe(1)
    expect(tupleCount(out[1])).toBe(1)
  })

  it('accepts rows with the same keys in a different order', () => {
    const rows = [
      { id: '1', title: 'a' },
      { title: 'b', id: '2' },
    ]
    const out = buildInsertStatements('tasks', rows)
    expect(out).toHaveLength(1)
    // Values follow the first row's column order for every row
    expect(out[0]).toBe('INSERT INTO "tasks" ("id", "title") VALUES (E\'1\', E\'a\'), (E\'2\', E\'b\');')
  })

  it('throws when a row has a different column set', () => {
    const rows = [
      { id: '1', title: 'a' },
      { id: '2', other: 'b' },
    ]
    expect(() => buildInsertStatements('tasks', rows)).toThrow(BackupSerializeError)
    expect(() => buildInsertStatements('tasks', [{ id: '1' }, { id: '2', extra: true }])).toThrow(
      BackupSerializeError
    )
  })

  it('throws on invalid table and column names', () => {
    expect(() => buildInsertStatements('bad"name', [{ id: '1' }])).toThrow(BackupSerializeError)
    expect(() => buildInsertStatements('1abc', [{ id: '1' }])).toThrow(BackupSerializeError)
    expect(() => buildInsertStatements('a;b', [{ id: '1' }])).toThrow(BackupSerializeError)
    expect(() => buildInsertStatements('tasks', [{ 'bad col': '1' }])).toThrow(BackupSerializeError)
  })

  it('always emits single-line INSERT statements ending in a semicolon', () => {
    const rows = [
      {
        id: '1',
        note: 'line1\n-- looks like a comment\nends with ;\n',
        tags: ["it's", 'multi\nline'],
        meta: { nested: "quote ' and\nnewline" },
        score: NaN,
      },
    ]
    const out = buildInsertStatements('notes', rows)
    for (const statement of out) {
      expect(hasRawLineBreak(statement)).toBe(false)
      expect(statement).toMatch(/^INSERT INTO "[A-Za-z_][A-Za-z0-9_]*" \(".*"\) VALUES \(.*\);$/)
    }
  })
})
