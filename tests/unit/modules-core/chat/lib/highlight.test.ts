/**
 * Tests for modules-core/chat/lib/highlight.ts — the dependency-free code
 * tokenizer behind chat code blocks.
 */
import { describe, it, expect } from 'vitest'
import { highlight, MAX_HIGHLIGHT_LENGTH, type Token } from '@/modules-core/chat/lib/highlight'

const kinds = (tokens: Token[]) => tokens.filter((t) => t.kind !== 'plain').map((t) => [t.kind, t.text])
const joined = (tokens: Token[]) => tokens.map((t) => t.text).join('')

describe('highlight', () => {
  it('always reproduces the input exactly', () => {
    const code = 'const x = foo("a\\"b", 42) // done\n/* c */ `t\n${y}`'
    expect(joined(highlight(code, 'ts'))).toBe(code)
  })

  it('tokenizes a TypeScript line', () => {
    expect(kinds(highlight('const total = sum(items, 3.5) // add', 'ts'))).toEqual([
      ['keyword', 'const'],
      ['function', 'sum'],
      ['number', '3.5'],
      ['comment', '// add'],
    ])
  })

  it('marks capitalised identifiers as types', () => {
    expect(kinds(highlight('new Map<String>()', 'ts'))).toEqual([
      ['keyword', 'new'],
      ['type', 'Map'],
      ['type', 'String'],
    ])
  })

  it('handles block comments, including unterminated ones', () => {
    expect(kinds(highlight('a /* b */ c', 'js'))).toEqual([['comment', '/* b */']])
    expect(kinds(highlight('a /* open', 'js'))).toEqual([['comment', '/* open']])
  })

  it('ends single-quoted strings at a newline but lets template strings span lines', () => {
    expect(kinds(highlight("'open\nx", 'js'))).toEqual([['string', "'open"]])
    expect(kinds(highlight('`a\nb`', 'js'))).toEqual([['string', '`a\nb`']])
  })

  it('handles escapes and an escape at the very end', () => {
    expect(kinds(highlight('"a\\"b"', 'js'))).toEqual([['string', '"a\\"b"']])
    expect(joined(highlight('"a\\', 'js'))).toBe('"a\\')
  })

  it('uses hash comments and triple quotes for Python', () => {
    expect(kinds(highlight('def f():\n    """doc\nmore"""  # note', 'python'))).toEqual([
      ['keyword', 'def'],
      ['function', 'f'],
      ['string', '"""doc\nmore"""'],
      ['comment', '# note'],
    ])
  })

  it('matches SQL keywords case-insensitively and uses -- comments', () => {
    expect(kinds(highlight('SELECT id FROM t -- all', 'sql'))).toEqual([
      ['keyword', 'SELECT'],
      ['keyword', 'FROM'],
      ['comment', '-- all'],
    ])
  })

  it('colours JSON keys apart from string values', () => {
    expect(kinds(highlight('{"name" : "ari", "n": 1}', 'json'))).toEqual([
      ['property', '"name"'],
      ['string', '"ari"'],
      ['property', '"n"'],
      ['number', '1'],
    ])
  })

  it('reads hex and binary numbers, but not digits inside identifiers', () => {
    expect(kinds(highlight('0xff 0b10 v2', 'c'))).toEqual([
      ['number', '0xff'],
      ['number', '0b10'],
    ])
    expect(kinds(highlight('2px', 'css'))).toEqual([['number', '2']])
  })

  it('treats # as plain text in CSS', () => {
    expect(kinds(highlight('#fff', 'css'))).toEqual([])
  })

  it('supports multiple line-comment markers (ini)', () => {
    expect(kinds(highlight('; a\n# b', 'ini'))).toEqual([
      ['comment', '; a'],
      ['comment', '# b'],
    ])
  })

  it('falls back to the C-like family for unknown or missing languages', () => {
    expect(kinds(highlight('return 1 // x'))).toEqual([
      ['keyword', 'return'],
      ['number', '1'],
      ['comment', '// x'],
    ])
    expect(kinds(highlight('return', 'brainfudge'))).toEqual([['keyword', 'return']])
  })

  it('leaves plain-text languages and oversized blocks unhighlighted', () => {
    expect(highlight('const x = 1', 'text')).toEqual([{ kind: 'plain', text: 'const x = 1' }])
    const big = 'a'.repeat(MAX_HIGHLIGHT_LENGTH + 1)
    expect(highlight(big, 'ts')).toEqual([{ kind: 'plain', text: big }])
  })

  it('merges adjacent plain characters into one token', () => {
    expect(highlight('a + b', 'ts')).toEqual([{ kind: 'plain', text: 'a + b' }])
  })

  it('treats an identifier right after a number as plain text', () => {
    expect(highlight('1e', 'ts')).toEqual([
      { kind: 'number', text: '1' },
      { kind: 'plain', text: 'e' },
    ])
  })
})
