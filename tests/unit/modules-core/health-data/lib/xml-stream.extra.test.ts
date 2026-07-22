/**
 * Extra coverage for health-data/lib/xml-stream.ts
 *
 * Uncovered lines/branches in findDeclarationEnd():
 * - (172, '30', '0'): quote !== 0 branch — entering the "inside quote" state
 * - (173, '31', '0'/'1'): `if (c === quote) quote = 0` — closing the quoted value
 * - (174, '32', '0'): `else if (c === 34 || c === 39)` — opening a quote
 * - (175): `quote = c` — assigning the open quote char
 *
 * Also covers branch (98, '12', '0') in write(): `lt + 1 >= len` — tag at end of chunk
 * And branch (135, '21', '2') in write(): `pos = lt; break` when '>' not found
 */
import { describe, it, expect } from 'vitest'
import { StreamingXmlParser } from '@/modules-core/health-data/lib/xml-stream'

function makeParser(interesting: string[] = []) {
  const opens: Array<{ name: string; attrs: Record<string, string> }> = []
  const closes: string[] = []
  const parser = new StreamingXmlParser(
    {
      onOpenTag: (name, attrs) => opens.push({ name, attrs }),
      onCloseTag: (name) => closes.push(name),
    },
    new Set(interesting)
  )
  return { parser, opens, closes }
}

describe('StreamingXmlParser — findDeclarationEnd with quoted values', () => {
  it('correctly handles double-quoted values inside DOCTYPE', () => {
    // DOCTYPE with a quoted string that contains a ] character
    // This forces the parser through the quote-tracking path in findDeclarationEnd
    const { parser, opens } = makeParser(['HealthData'])
    const doc = `<!DOCTYPE HealthData PUBLIC "-//APPLE//DTD HEALTH 1.0//EN" "http://www.apple.com/DTDs/health.dtd">` +
                `<HealthData locale="en_US"/>`
    parser.write(doc)
    expect(opens).toHaveLength(1)
    expect(opens[0].name).toBe('HealthData')
  })

  it('handles DOCTYPE with single-quoted system identifier', () => {
    // Single-quoted string in DOCTYPE — exercises the c === 39 branch
    const { parser, opens } = makeParser(['Foo'])
    const doc = `<!DOCTYPE Foo SYSTEM 'http://example.com/foo.dtd'><Foo/>`
    parser.write(doc)
    expect(opens).toHaveLength(1)
    expect(opens[0].name).toBe('Foo')
  })

  it('handles DOCTYPE with quoted value containing > character', () => {
    // A > inside a quoted value in DOCTYPE must not end the declaration early
    const { parser, opens } = makeParser(['Root'])
    // The PUBLIC identifier contains > which must be treated as part of the quote
    const doc = `<!DOCTYPE Root PUBLIC "a>b" "http://example.com"><Root/>`
    parser.write(doc)
    expect(opens).toHaveLength(1)
    expect(opens[0].name).toBe('Root')
  })

  it('handles DOCTYPE with double-quoted value containing ] character inside', () => {
    // A ] inside a quoted value must not decrement subsetDepth
    const { parser, opens } = makeParser(['Root'])
    const doc = `<!DOCTYPE Root PUBLIC "] not a depth change" "url"><Root/>`
    parser.write(doc)
    // Should not throw — the ] inside quotes does not affect bracket counting
    expect(opens.find(o => o.name === 'Root')).toBeDefined()
  })

  it('handles DOCTYPE that spans two chunks (quote in second chunk)', () => {
    const { parser, opens } = makeParser(['Foo'])
    // Split the DOCTYPE across two write() calls so the quote is in the second chunk
    parser.write('<!DOCTYPE Foo SY')
    parser.write('STEM "foo.dtd"><Foo/>')
    expect(opens).toHaveLength(1)
    expect(opens[0].name).toBe('Foo')
  })
})

describe('StreamingXmlParser — write() edge cases', () => {
  it('handles chunk ending with < (incomplete tag start)', () => {
    const { parser, opens } = makeParser(['Foo'])
    // Chunk ends right at '<' — the tag is incomplete, buffered for next write
    parser.write('<')
    parser.write('Foo/>')
    expect(opens).toHaveLength(1)
    expect(opens[0].name).toBe('Foo')
  })

  it('handles close tag that is split across chunks', () => {
    const { parser, closes } = makeParser()
    parser.write('<Foo></F')
    parser.write('oo>')
    expect(closes).toEqual(['Foo'])
  })

  it('buffers partial comment spanning multiple chunks', () => {
    const { parser, opens } = makeParser(['Foo'])
    parser.write('<!-- com')
    parser.write('ment --><Foo/>')
    expect(opens).toHaveLength(1)
    expect(opens[0].name).toBe('Foo')
  })
})
