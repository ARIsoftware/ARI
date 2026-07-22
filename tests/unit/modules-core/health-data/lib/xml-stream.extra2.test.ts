/**
 * Extra coverage for health-data/lib/xml-stream.ts.
 *
 * Target: branch 135 — the single-quoted attribute path (match[3])
 * in the ATTR_REGEX match inside write().
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

describe('StreamingXmlParser — single-quoted attributes', () => {
  it('parses single-quoted attribute values (match[3] path)', () => {
    const { parser, opens } = makeParser(['Record'])
    // Use single quotes for attribute values
    parser.write("<Record type='HKQuantityTypeIdentifierStepCount' value='1000'/>")
    expect(opens).toHaveLength(1)
    expect(opens[0].attrs['type']).toBe('HKQuantityTypeIdentifierStepCount')
    expect(opens[0].attrs['value']).toBe('1000')
  })

  it('parses mixed double and single quoted attributes', () => {
    const { parser, opens } = makeParser(['Record'])
    parser.write(`<Record type="steps" value='500'/>`)
    expect(opens[0].attrs['type']).toBe('steps')
    expect(opens[0].attrs['value']).toBe('500')
  })
})
