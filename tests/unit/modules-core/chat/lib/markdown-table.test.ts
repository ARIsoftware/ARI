/**
 * Tests for modules-core/chat/lib/markdown-table.ts — GFM table row and
 * separator parsing.
 */
import { describe, it, expect } from 'vitest'
import { isTableStart, parseTableSeparator, splitTableRow } from '@/modules-core/chat/lib/markdown-table'

describe('splitTableRow', () => {
  it('splits a piped row and trims cells', () => {
    expect(splitTableRow('| a | b |')).toEqual(['a', 'b'])
    expect(splitTableRow('a | b')).toEqual(['a', 'b'])
  })

  it('keeps escaped pipes inside a cell', () => {
    expect(splitTableRow('| a \\| b | c |')).toEqual(['a | b', 'c'])
    expect(splitTableRow('| a | b \\|')).toEqual(['a', 'b |'])
  })

  it('returns null for a line without pipes', () => {
    expect(splitTableRow('just text')).toBeNull()
  })
})

describe('parseTableSeparator', () => {
  it('reads column alignment', () => {
    expect(parseTableSeparator('| --- | :--- | ---: | :---: |')).toEqual([null, 'left', 'right', 'center'])
  })

  it('rejects non-separator rows', () => {
    expect(parseTableSeparator('| a | b |')).toBeNull()
    expect(parseTableSeparator('| -- | --- |')).toBeNull()
    expect(parseTableSeparator('no pipes')).toBeNull()
  })
})

describe('isTableStart', () => {
  it('needs a header followed by a matching separator', () => {
    expect(isTableStart(['| a | b |', '|---|---|'], 0)).toBe(true)
    expect(isTableStart(['| a | b |', '|---|'], 0)).toBe(false)
    expect(isTableStart(['| a | b |', 'text'], 0)).toBe(false)
    expect(isTableStart(['plain', '|---|'], 0)).toBe(false)
    expect(isTableStart(['| a | b |'], 0)).toBe(false)
  })
})
