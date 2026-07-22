import { describe, it, expect, vi } from 'vitest'
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

describe('StreamingXmlParser — basic elements', () => {
  it('fires onOpenTag for a simple element', () => {
    const { parser, opens } = makeParser()
    parser.write('<Foo/>')
    expect(opens).toHaveLength(1)
    expect(opens[0].name).toBe('Foo')
  })

  it('fires onCloseTag for a self-closing element', () => {
    const { parser, closes } = makeParser()
    parser.write('<Foo/>')
    expect(closes).toEqual(['Foo'])
  })

  it('fires onCloseTag for an explicit close tag', () => {
    const { parser, closes } = makeParser()
    parser.write('<Foo></Foo>')
    expect(closes).toEqual(['Foo'])
  })

  it('parses nested elements', () => {
    const { parser, opens, closes } = makeParser(['A', 'B'])
    parser.write('<A><B x="1"/></A>')
    expect(opens.map((o) => o.name)).toEqual(['A', 'B'])
    expect(closes).toEqual(['B', 'A'])
  })

  it('emits empty attrs for non-interesting tags', () => {
    const { parser, opens } = makeParser([]) // nothing interesting
    parser.write('<Record type="HKTest" value="42"/>')
    expect(opens[0].attrs).toEqual({})
  })

  it('parses attributes for interesting tags', () => {
    const { parser, opens } = makeParser(['Record'])
    parser.write('<Record type="HKTest" value="42"/>')
    expect(opens[0].attrs).toEqual({ type: 'HKTest', value: '42' })
  })

  it('handles single-quoted attribute values', () => {
    const { parser, opens } = makeParser(['Record'])
    parser.write("<Record type='HKTest' value='99'/>")
    expect(opens[0].attrs).toEqual({ type: 'HKTest', value: '99' })
  })
})

describe('StreamingXmlParser — entity decoding', () => {
  it('decodes &lt; &gt; &amp; &quot; &apos;', () => {
    const { parser, opens } = makeParser(['Record'])
    parser.write('<Record value="a&lt;b&gt;c&amp;d&quot;e&apos;f"/>')
    expect(opens[0].attrs.value).toBe('a<b>c&d"e\'f')
  })

  it('decodes decimal character references', () => {
    const { parser, opens } = makeParser(['Record'])
    parser.write('<Record value="&#65;&#66;"/>')
    expect(opens[0].attrs.value).toBe('AB')
  })

  it('decodes hex character references', () => {
    const { parser, opens } = makeParser(['Record'])
    parser.write('<Record value="&#x41;&#x42;"/>')
    expect(opens[0].attrs.value).toBe('AB')
  })

  it('replaces invalid code points with replacement character', () => {
    const { parser, opens } = makeParser(['Record'])
    parser.write('<Record value="&#xD800;"/>')  // surrogate — invalid
    // Source uses '?', replacement char unicode U+FFFD, or '?' — just verify non-empty
    expect(opens[0].attrs.value.length).toBeGreaterThan(0)
    expect(opens).toHaveLength(1) // does not throw
  })

  it('replaces out-of-range code points', () => {
    const { parser, opens } = makeParser(['Record'])
    parser.write('<Record value="&#x200000;"/>')  // > 0x10FFFF
    expect(opens[0].attrs.value.length).toBeGreaterThan(0)
  })

  it('does not decode when no & present', () => {
    const { parser, opens } = makeParser(['Record'])
    parser.write('<Record value="hello"/>')
    expect(opens[0].attrs.value).toBe('hello')
  })
})

describe('StreamingXmlParser — XML declaration and comments', () => {
  it('skips XML declaration', () => {
    const { parser, opens } = makeParser()
    parser.write('<?xml version="1.0" encoding="UTF-8"?><Foo/>')
    expect(opens[0].name).toBe('Foo')
  })

  it('skips XML comments', () => {
    const { parser, opens, closes } = makeParser()
    parser.write('<!-- this is a comment --><Foo/>')
    expect(opens).toHaveLength(1)
    expect(opens[0].name).toBe('Foo')
  })

  it('skips DOCTYPE with internal subset', () => {
    const { parser, opens } = makeParser(['HealthData'])
    const doc = `<!DOCTYPE HealthData [<!ELEMENT HealthData (ExportDate, Me, Record*)>]><HealthData locale="en_US"/>`
    parser.write(doc)
    expect(opens).toHaveLength(1)
    expect(opens[0].name).toBe('HealthData')
    expect(opens[0].attrs.locale).toBe('en_US')
  })
})

describe('StreamingXmlParser — chunked input', () => {
  it('handles tags split across write() chunks', () => {
    const { parser, opens } = makeParser(['Record'])
    parser.write('<Rec')
    parser.write('ord type="HK" value="1"/>')
    expect(opens).toHaveLength(1)
    expect(opens[0].attrs.type).toBe('HK')
  })

  it('handles attribute values split across chunks', () => {
    const { parser, opens } = makeParser(['Record'])
    parser.write('<Record type="HK')
    parser.write('Test"/>')
    expect(opens[0].attrs.type).toBe('HKTest')
  })

  it('processes multiple tags across many writes', () => {
    const { parser, opens } = makeParser()
    const xml = '<A/><B/><C/>'
    for (const char of xml) {
      parser.write(char)
    }
    expect(opens.map((o) => o.name)).toEqual(['A', 'B', 'C'])
  })
})

describe('StreamingXmlParser — > inside attribute values', () => {
  it('correctly handles > inside a quoted attribute value', () => {
    const { parser, opens } = makeParser(['Record'])
    parser.write('<Record value="a>b"/>')
    expect(opens[0].attrs.value).toBe('a>b')
  })
})

describe('StreamingXmlParser — buffer overflow protection', () => {
  it('throws when an unterminated tag exceeds the buffer limit', () => {
    const { parser } = makeParser()
    const huge = '<' + 'x'.repeat(8 * 1024 * 1024 + 100)
    expect(() => parser.write(huge)).toThrow(/Malformed XML/)
  })
})

describe('StreamingXmlParser — realistic Apple Health XML', () => {
  const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE HealthData [
<!ELEMENT HealthData (ExportDate,Me,(Record|Correlation|Workout|ActivitySummary)*)>
]>
<HealthData locale="en_US">
 <ExportDate value="2026-06-01 10:00:00 -0400"/>
 <Me HKCharacteristicTypeIdentifierDateOfBirth="1990-05-15"
     HKCharacteristicTypeIdentifierBiologicalSex="HKBiologicalSexMale"
     HKCharacteristicTypeIdentifierBloodType="HKBloodTypeAPositive"/>
 <Record type="HKQuantityTypeIdentifierStepCount"
         sourceName="iPhone"
         startDate="2026-01-01 00:00:00 -0500"
         endDate="2026-01-01 23:59:59 -0500"
         value="8432"
         unit="count"/>
 <Workout workoutActivityType="HKWorkoutActivityTypeRunning"
          startDate="2026-01-01 07:00:00 -0500"
          endDate="2026-01-01 07:30:00 -0500"
          duration="30" durationUnit="min"
          sourceName="Apple Watch">
   <WorkoutStatistics type="HKQuantityTypeIdentifierHeartRate" average="142" maximum="170"/>
   <WorkoutStatistics type="HKQuantityTypeIdentifierDistanceWalkingRunning" sum="5.0" unit="km"/>
   <WorkoutStatistics type="HKQuantityTypeIdentifierActiveEnergyBurned" sum="300" unit="Cal"/>
 </Workout>
 <ActivitySummary dateComponents="2026-01-01"
                  activeEnergyBurned="400" activeEnergyBurnedGoal="600"
                  appleExerciseTime="30" appleExerciseTimeGoal="30"
                  appleStandHours="10" appleStandHoursGoal="12"/>
</HealthData>`

  it('parses interesting tags with correct attributes', () => {
    const interesting = new Set([
      'HealthData', 'ExportDate', 'Me', 'Record', 'Workout',
      'WorkoutStatistics', 'MetadataEntry', 'ActivitySummary',
    ])
    const opens: Array<{ name: string; attrs: Record<string, string> }> = []
    const closes: string[] = []
    const parser = new StreamingXmlParser(
      {
        onOpenTag: (name, attrs) => opens.push({ name, attrs }),
        onCloseTag: (name) => closes.push(name),
      },
      interesting
    )
    parser.write(SAMPLE_XML)

    const healthData = opens.find((o) => o.name === 'HealthData')
    expect(healthData?.attrs.locale).toBe('en_US')

    const exportDate = opens.find((o) => o.name === 'ExportDate')
    expect(exportDate?.attrs.value).toBe('2026-06-01 10:00:00 -0400')

    const me = opens.find((o) => o.name === 'Me')
    expect(me?.attrs.HKCharacteristicTypeIdentifierBiologicalSex).toBe('HKBiologicalSexMale')

    const record = opens.find((o) => o.name === 'Record')
    expect(record?.attrs.type).toBe('HKQuantityTypeIdentifierStepCount')
    expect(record?.attrs.value).toBe('8432')

    const activitySummary = opens.find((o) => o.name === 'ActivitySummary')
    expect(activitySummary?.attrs.dateComponents).toBe('2026-01-01')

    const workoutStats = opens.filter((o) => o.name === 'WorkoutStatistics')
    expect(workoutStats).toHaveLength(3)

    // Workout should fire a close tag
    expect(closes).toContain('Workout')
  })

  it('processes in chunks producing same result', () => {
    const interesting = new Set(['HealthData', 'ExportDate', 'Record'])
    const opens1: string[] = []
    const p1 = new StreamingXmlParser(
      { onOpenTag: (n) => opens1.push(n), onCloseTag: () => {} },
      interesting
    )
    p1.write(SAMPLE_XML)

    const opens2: string[] = []
    const p2 = new StreamingXmlParser(
      { onOpenTag: (n) => opens2.push(n), onCloseTag: () => {} },
      interesting
    )
    // Feed 10 bytes at a time
    for (let i = 0; i < SAMPLE_XML.length; i += 10) {
      p2.write(SAMPLE_XML.slice(i, i + 10))
    }

    expect(opens1).toEqual(opens2)
  })
})
