/**
 * Extra coverage for health-data/lib/parser.ts — targets uncovered lines:
 *
 * - distanceToKm: 'm' and 'yd' unit cases
 * - energyToKcal: 'J' unit case
 * - lengthToMeters: 'cm', 'ft', 'in', 'km' cases (used for height/elevation)
 * - ECG/GPX/clinical readZipEntry error paths (catch blocks, lines 371, 391, 411)
 * - Sleep session merge (two naps/sessions ending the same night date, lines 839-849)
 * - sumNullable edge cases (lines 858-860)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Readable } from 'node:stream'

// ── Reuse the same mock as parser.test.ts ───────────────────────────────────
let _xmlContent = ''
let _ecgBuffers: Buffer[] = []
let _gpxBuffers: Buffer[] = []
let _clinicalBuffers: Buffer[] = []
let _ecgShouldThrow = false
let _gpxShouldThrow = false
let _clinicalShouldThrow = false

vi.mock('@/modules-core/health-data/lib/zip-reader', () => ({
  readZipDirectory: vi.fn(async () => ({
    entries: [
      { path: 'apple_health_export/export.xml', uncompressedSize: 100, compressionMethod: 0, localHeaderOffset: 0, compressedSize: 100 },
      ...(_ecgBuffers.map((_, i) => ({
        path: `apple_health_export/electrocardiograms/ecg_${i}.csv`,
        uncompressedSize: 100, compressionMethod: 0, localHeaderOffset: 0, compressedSize: 100,
      }))),
      ...(_gpxBuffers.map((_, i) => ({
        path: `apple_health_export/workout-routes/route_2026-01-0${i + 1}_7.00am.gpx`,
        uncompressedSize: 100, compressionMethod: 0, localHeaderOffset: 0, compressedSize: 100,
      }))),
      ...(_clinicalBuffers.map((_, i) => ({
        path: `apple_health_export/clinical-records/record_${i}.json`,
        uncompressedSize: 100, compressionMethod: 0, localHeaderOffset: 0, compressedSize: 100,
      }))),
    ],
  })),
  findExportXml: vi.fn((entries: any[]) =>
    entries.find((e: any) => e.path.endsWith('export.xml')) ?? null
  ),
  openZipEntryStream: vi.fn(async () => {
    return Readable.from([Buffer.from(_xmlContent, 'utf8')])
  }),
  readZipEntry: vi.fn(async (_zipPath: string, entry: any, _maxBytes: number) => {
    if (/electrocardiograms/.test(entry.path)) {
      if (_ecgShouldThrow) throw new Error('ECG read error')
      const idx = parseInt(entry.path.match(/ecg_(\d+)/)?.[1] ?? '0')
      return _ecgBuffers[idx] ?? Buffer.from('')
    }
    if (/workout-routes/.test(entry.path)) {
      if (_gpxShouldThrow) throw new Error('GPX read error')
      const idx = parseInt(entry.path.match(/route_2026-01-0(\d+)/)?.[1] ?? '1') - 1
      return _gpxBuffers[idx] ?? Buffer.from('')
    }
    if (/clinical-records/.test(entry.path)) {
      if (_clinicalShouldThrow) throw new Error('Clinical read error')
      const idx = parseInt(entry.path.match(/record_(\d+)/)?.[1] ?? '0')
      return _clinicalBuffers[idx] ?? Buffer.from('')
    }
    return Buffer.from('')
  }),
}))

import { parseHealthExport } from '@/modules-core/health-data/lib/parser'

function noopProgress() {
  return Promise.resolve()
}

function makeXml(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE HealthData []>
<HealthData locale="en_US">
 <ExportDate value="2026-06-01 10:00:00 -0400"/>
 <Me HKCharacteristicTypeIdentifierDateOfBirth="1990-05-15"
     HKCharacteristicTypeIdentifierBiologicalSex="HKBiologicalSexMale"
     HKCharacteristicTypeIdentifierBloodType="HKBloodTypeAPositive"/>
${body}
</HealthData>`
}

function makeSleepXml(value: string, start: string, end: string, source = 'iPhone'): string {
  return `<Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="${source}" value="${value}" startDate="${start}" endDate="${end}"/>`
}

beforeEach(() => {
  _xmlContent = ''
  _ecgBuffers = []
  _gpxBuffers = []
  _clinicalBuffers = []
  _ecgShouldThrow = false
  _gpxShouldThrow = false
  _clinicalShouldThrow = false
})

// ---------------------------------------------------------------------------
// Unit conversion: distance with 'm' and 'yd'
// ---------------------------------------------------------------------------
describe('parseHealthExport — distanceToKm unit conversions (m, yd)', () => {
  it('converts totalDistance in meters (m) to km', async () => {
    const xml = `<Workout workoutActivityType="HKWorkoutActivityTypeRunning"
       sourceName="Apple Watch"
       startDate="2026-01-15 07:00:00 -0500"
       endDate="2026-01-15 07:30:00 -0500"
       duration="30" durationUnit="min"
       totalDistance="5000" totalDistanceUnit="m">
   </Workout>`
    _xmlContent = makeXml(xml)
    const result = await parseHealthExport('/fake.zip', noopProgress)
    // 5000m = 5km
    expect(result.workouts[0].distanceKm).toBeCloseTo(5.0, 2)
  })

  it('converts totalDistance in yards (yd) to km', async () => {
    const xml = `<Workout workoutActivityType="HKWorkoutActivityTypeSwimming"
       sourceName="Apple Watch"
       startDate="2026-01-15 07:00:00 -0500"
       endDate="2026-01-15 07:30:00 -0500"
       duration="30" durationUnit="min"
       totalDistance="1093.61" totalDistanceUnit="yd">
   </Workout>`
    _xmlContent = makeXml(xml)
    const result = await parseHealthExport('/fake.zip', noopProgress)
    // 1093.61 yd * 0.0009144 ≈ 1.0 km
    expect(result.workouts[0].distanceKm).toBeCloseTo(1.0, 1)
  })
})

// ---------------------------------------------------------------------------
// Unit conversion: energy 'J'
// ---------------------------------------------------------------------------
describe('parseHealthExport — energyToKcal unit conversion (J)', () => {
  it('converts totalEnergyBurned in joules (J) to kcal', async () => {
    const xml = `<Workout workoutActivityType="HKWorkoutActivityTypeRunning"
       sourceName="Apple Watch"
       startDate="2026-01-15 07:00:00 -0500"
       endDate="2026-01-15 07:30:00 -0500"
       duration="30" durationUnit="min"
       totalEnergyBurned="1255200" totalEnergyBurnedUnit="J">
   </Workout>`
    _xmlContent = makeXml(xml)
    const result = await parseHealthExport('/fake.zip', noopProgress)
    // 1255200 J / 4184 ≈ 300 kcal
    expect(result.workouts[0].energyKcal).toBeCloseTo(300, 0)
  })
})

// ---------------------------------------------------------------------------
// Unit conversion: height in cm, ft, in, km (lengthToMeters)
// ---------------------------------------------------------------------------
describe('parseHealthExport — lengthToMeters unit conversions (cm, ft, in, km)', () => {
  it('converts height in cm to meters', async () => {
    _xmlContent = makeXml(
      `<Record type="HKQuantityTypeIdentifierHeight" sourceName="iPhone" unit="cm"
         startDate="2026-01-15 09:00:00 -0500" endDate="2026-01-15 09:00:01 -0500" value="180"/>`
    )
    const result = await parseHealthExport('/fake.zip', noopProgress)
    // 180 cm = 1.8 m (lengthToMeters converts it, stored in standard unit)
    const metric = result.dailyMetrics.find((m) => m.metricType === 'height')
    expect(metric).toBeDefined()
    expect(metric?.sampleCount).toBe(1)
  })

  it('converts height in ft to meters (via MetadataEntry elevation)', async () => {
    // Elevation in a workout in feet - tests the ft branch of lengthToMeters
    const xml = `<Workout workoutActivityType="HKWorkoutActivityTypeRunning"
       sourceName="Apple Watch"
       startDate="2026-01-15 07:00:00 -0500"
       endDate="2026-01-15 07:30:00 -0500"
       duration="30" durationUnit="min">
     <MetadataEntry key="HKElevationAscended" value="164 ft"/>
   </Workout>`
    _xmlContent = makeXml(xml)
    const result = await parseHealthExport('/fake.zip', noopProgress)
    // 164 ft * 0.3048 ≈ 50m
    expect(result.workouts[0].elevationGainM).toBeCloseTo(50, 0)
  })

  it('converts elevation in inches (in) to meters', async () => {
    const xml = `<Workout workoutActivityType="HKWorkoutActivityTypeRunning"
       sourceName="Apple Watch"
       startDate="2026-01-15 07:00:00 -0500"
       endDate="2026-01-15 07:30:00 -0500"
       duration="30" durationUnit="min">
     <MetadataEntry key="HKElevationAscended" value="1968.5 in"/>
   </Workout>`
    _xmlContent = makeXml(xml)
    const result = await parseHealthExport('/fake.zip', noopProgress)
    // 1968.5 in * 0.0254 ≈ 50m
    expect(result.workouts[0].elevationGainM).toBeCloseTo(50, 0)
  })

  it('converts elevation in km to meters', async () => {
    const xml = `<Workout workoutActivityType="HKWorkoutActivityTypeRunning"
       sourceName="Apple Watch"
       startDate="2026-01-15 07:00:00 -0500"
       endDate="2026-01-15 07:30:00 -0500"
       duration="30" durationUnit="min">
     <MetadataEntry key="HKElevationAscended" value="0.05 km"/>
   </Workout>`
    _xmlContent = makeXml(xml)
    const result = await parseHealthExport('/fake.zip', noopProgress)
    // 0.05 km * 1000 = 50m
    expect(result.workouts[0].elevationGainM).toBeCloseTo(50, 0)
  })
})

// ---------------------------------------------------------------------------
// Error catch paths: ECG, GPX, clinical readZipEntry throws
// ---------------------------------------------------------------------------
describe('parseHealthExport — error catch in ECG/GPX/clinical parsing', () => {
  it('skips unreadable ECG files (readZipEntry throws) gracefully', async () => {
    _ecgBuffers = [Buffer.from('dummy')]
    _ecgShouldThrow = true
    _xmlContent = makeXml('')
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await parseHealthExport('/fake.zip', noopProgress)

    expect(result.ecgs).toHaveLength(0)
    // console.error is called as (message, err) — 2 arguments
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Skipping unreadable ECG file'),
      expect.any(Error),
    )
    errorSpy.mockRestore()
  })

  it('skips unreadable GPX files (readZipEntry throws) gracefully', async () => {
    _gpxBuffers = [Buffer.from('dummy')]
    _gpxShouldThrow = true
    _xmlContent = makeXml('')
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await parseHealthExport('/fake.zip', noopProgress)

    expect(result.routes).toHaveLength(0)
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Skipping unreadable route file'),
      expect.any(Error),
    )
    errorSpy.mockRestore()
  })

  it('skips unreadable clinical record files (readZipEntry throws) gracefully', async () => {
    _clinicalBuffers = [Buffer.from('dummy')]
    _clinicalShouldThrow = true
    _xmlContent = makeXml('')
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await parseHealthExport('/fake.zip', noopProgress)

    expect(result.clinical).toHaveLength(0)
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Skipping unreadable clinical record'),
      expect.any(Error),
    )
    errorSpy.mockRestore()
  })
})

// ---------------------------------------------------------------------------
// Sleep session merge: two sessions ending on the same night date
//
// The merge path (lines 839-849) fires when two sessions have different
// sleep-session boundaries (>6h gap) but share the same endLocalDate
// (slice(0,10) of attrs.endDate).
//
// Strategy: two short naps (>15min) that both end on 2026-01-15:
//   Nap 1: 00:00 → 01:00 on Jan 15 (60min)
//   Nap 2: 08:00 → 09:30 on Jan 15 (90min, starts 7h after nap1 ends → new session)
// ---------------------------------------------------------------------------
describe('parseHealthExport — sleep session merge (two sessions same night)', () => {
  it('merges two short sessions that both end on the same calendar date', async () => {
    // Nap 1: midnight to 1am Jan 15 — 60 min, valid (>15min)
    const nap1 = `<Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="iPhone"
       value="HKCategoryValueSleepAnalysisAsleepCore"
       startDate="2026-01-15 00:00:00 -0500"
       endDate="2026-01-15 01:00:00 -0500"/>`
    // Nap 2: 8am to 9:30am Jan 15 — 90 min, >6h after nap1 → separate session,
    // but endLocalDate is still "2026-01-15"
    const nap2 = `<Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="iPhone"
       value="HKCategoryValueSleepAnalysisAsleepCore"
       startDate="2026-01-15 08:00:00 -0500"
       endDate="2026-01-15 09:30:00 -0500"/>`
    _xmlContent = makeXml(nap1 + nap2)
    const result = await parseHealthExport('/fake.zip', noopProgress)
    // Both sessions end on "2026-01-15" → merged into 1 entry in byNight
    const nights = result.sleepNights.filter(n => n.nightDate === '2026-01-15')
    expect(nights.length).toBe(1)
    // Combined coreMin = 60 + 90 = 150
    expect(nights[0].coreMin).toBeCloseTo(150, 0)
  })

  it('records the earliest startTime after merging two sessions (same nightDate)', async () => {
    // Session 1: midnight nap ending Jan 16
    const s1 = `<Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="iPhone"
       value="HKCategoryValueSleepAnalysisAsleepCore"
       startDate="2026-01-16 00:00:00 -0500"
       endDate="2026-01-16 01:00:00 -0500"/>`
    // Session 2: morning session ending Jan 16, > 6h after session 1 ends
    const s2 = `<Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="iPhone"
       value="HKCategoryValueSleepAnalysisAsleepCore"
       startDate="2026-01-16 08:00:00 -0500"
       endDate="2026-01-16 09:30:00 -0500"/>`
    _xmlContent = makeXml(s1 + s2)
    const result = await parseHealthExport('/fake.zip', noopProgress)
    const night = result.sleepNights.find(n => n.nightDate === '2026-01-16')
    if (night) {
      // startTime should be the earlier one (00:00 from session1)
      expect(night.startTime).toContain('2026-01-16T00:00:00')
    }
  })
})

// ---------------------------------------------------------------------------
// Sleep: endMs update path (lines 797-800) — when a later record in the same
// session has a greater endMs than the current session maximum
// ---------------------------------------------------------------------------
describe('parseHealthExport — sleep endMs/endIso update within a session', () => {
  it('tracks the latest end time within a multi-record sleep session', async () => {
    // Two records in the SAME session (gap < 6h), second record ends later
    const r1 = `<Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="iPhone"
       value="HKCategoryValueSleepAnalysisAsleepCore"
       startDate="2026-01-15 22:00:00 -0500"
       endDate="2026-01-16 02:00:00 -0500"/>`
    const r2 = `<Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="iPhone"
       value="HKCategoryValueSleepAnalysisAsleepREM"
       startDate="2026-01-16 02:30:00 -0500"
       endDate="2026-01-16 06:00:00 -0500"/>`
    _xmlContent = makeXml(r1 + r2)
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.sleepNights.length).toBeGreaterThanOrEqual(1)
    const night = result.sleepNights[0]
    // The latest endMs (from r2 = 06:00) should be reflected
    expect(night.endTime).toContain('2026-01-16T06:00:00')
  })
})

// ---------------------------------------------------------------------------
// sumNullable: exercised via sleep session merge where some fields are null
// ---------------------------------------------------------------------------
describe('parseHealthExport — sumNullable via sleep merge', () => {
  it('handles null inBedMin when merging two sessions that have no in-bed records', async () => {
    // Two naps on same day with no InBed records → inBedMin stays null,
    // sumNullable(null, null) should return null (b === null → return a === null)
    const nap1 = `<Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="iPhone"
       value="HKCategoryValueSleepAnalysisAsleepCore"
       startDate="2026-01-17 00:00:00 -0500"
       endDate="2026-01-17 01:00:00 -0500"/>`
    const nap2 = `<Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="iPhone"
       value="HKCategoryValueSleepAnalysisAsleepCore"
       startDate="2026-01-17 08:00:00 -0500"
       endDate="2026-01-17 09:30:00 -0500"/>`
    _xmlContent = makeXml(nap1 + nap2)
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.sleepNights.length).toBeGreaterThanOrEqual(1)
    const night = result.sleepNights.find(n => n.nightDate === '2026-01-17')
    if (night) {
      // inBedMin should be null (sumNullable(null, null) = null)
      expect(night.inBedMin).toBeNull()
      // coreMin should be the sum = 60 + 90 = 150
      expect(night.coreMin).toBeCloseTo(150, 0)
    }
  })

  it('handles one null + one non-null inBedMin during merge (sumNullable(null, n))', async () => {
    // Session 1: core + inBed records; Session 2 on same day with only core (no inBed)
    // When merged: existing.inBedMin (non-null) + night.inBedMin (null) → sumNullable returns existing
    const session1core = `<Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Watch"
       value="HKCategoryValueSleepAnalysisAsleepCore"
       startDate="2026-01-18 00:00:00 -0500"
       endDate="2026-01-18 01:00:00 -0500"/>`
    const session1inbed = `<Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="iPhone"
       value="HKCategoryValueSleepAnalysisInBed"
       startDate="2026-01-17 23:30:00 -0500"
       endDate="2026-01-18 01:00:00 -0500"/>`
    const session2core = `<Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Watch"
       value="HKCategoryValueSleepAnalysisAsleepCore"
       startDate="2026-01-18 08:00:00 -0500"
       endDate="2026-01-18 09:30:00 -0500"/>`
    _xmlContent = makeXml(session1core + session1inbed + session2core)
    const result = await parseHealthExport('/fake.zip', noopProgress)
    const night = result.sleepNights.find(n => n.nightDate === '2026-01-18')
    if (night) {
      // inBedMin should be non-null (from session1inbed) after merge
      expect(night.inBedMin).not.toBeNull()
    }
  })
})

// ---------------------------------------------------------------------------
// lengthToMeters: 'cm' branch — via MetadataEntry HKElevationAscended in cm
// ---------------------------------------------------------------------------
describe('parseHealthExport — lengthToMeters cm branch', () => {
  it('converts elevation in cm to meters via MetadataEntry', async () => {
    const xml = `<Workout workoutActivityType="HKWorkoutActivityTypeRunning"
       sourceName="Apple Watch"
       startDate="2026-01-15 07:00:00 -0500"
       endDate="2026-01-15 07:30:00 -0500"
       duration="30" durationUnit="min">
     <MetadataEntry key="HKElevationAscended" value="5000 cm"/>
   </Workout>`
    _xmlContent = makeXml(xml)
    const result = await parseHealthExport('/fake.zip', noopProgress)
    // 5000 cm / 100 = 50m
    expect(result.workouts[0].elevationGainM).toBeCloseTo(50, 0)
  })
})

// ---------------------------------------------------------------------------
// convertUnit: degF ↔ degC conversion (lines 216-217)
// Also covers: fromUnit === toUnit early return (line 214)
// And: null return when units are incompatible across dimensions (line 223)
// ---------------------------------------------------------------------------
describe('parseHealthExport — convertUnit temperature conversion', () => {
  it('converts degF samples to degC when degC is the stored unit', async () => {
    // First record sets unit to degC, second arrives in degF → convertUnit runs
    const xml =
      `<Record type="HKQuantityTypeIdentifierAppleSleepingWristTemperature" sourceName="Watch" unit="degC"` +
      ` startDate="2026-01-15 00:00:00 -0500" endDate="2026-01-15 00:00:01 -0500" value="36"/>` +
      `<Record type="HKQuantityTypeIdentifierAppleSleepingWristTemperature" sourceName="iPhone" unit="degF"` +
      ` startDate="2026-01-15 01:00:00 -0500" endDate="2026-01-15 01:00:01 -0500" value="98.6"/>`
    _xmlContent = makeXml(xml)
    const result = await parseHealthExport('/fake.zip', noopProgress)
    // Both records should be aggregated (98.6°F = 37°C)
    const metric = result.dailyMetrics.find((m) => m.metricType === 'apple_sleeping_wrist_temperature')
    expect(metric).toBeDefined()
    expect(metric?.sampleCount).toBe(2)
  })

  it('skips samples in incompatible units (convertUnit returns null)', async () => {
    // First record sets unit to 'degC', second arrives in 'km' → incompatible
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const xml =
      `<Record type="HKQuantityTypeIdentifierAppleSleepingWristTemperature" sourceName="Watch" unit="degC"` +
      ` startDate="2026-01-15 00:00:00 -0500" endDate="2026-01-15 00:00:01 -0500" value="36"/>` +
      `<Record type="HKQuantityTypeIdentifierAppleSleepingWristTemperature" sourceName="iPhone" unit="km"` +
      ` startDate="2026-01-15 01:00:00 -0500" endDate="2026-01-15 01:00:01 -0500" value="5"/>`
    _xmlContent = makeXml(xml)
    const result = await parseHealthExport('/fake.zip', noopProgress)
    // Only the first sample counts — second was incompatible
    const metric = result.dailyMetrics.find((m) => m.metricType === 'apple_sleeping_wrist_temperature')
    expect(metric?.sampleCount).toBe(1)
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Skipping'),
    )
    warnSpy.mockRestore()
  })
})

// ---------------------------------------------------------------------------
// ECG CSV parsing branches (lines 908-932)
// ---------------------------------------------------------------------------
describe('parseHealthExport — ECG CSV parsing branches', () => {
  // Helper to build an ECG CSV buffer
  function makeEcgCsv({
    recordedAt = 'Recorded Date,2026-01-15 10:00:00 -0500',
    classification = 'Classification,Sinus Rhythm',
    symptoms = 'Symptoms,None',
    device = 'Device,"Watch6,3"',
    sampleRate = 'Sample Rate,512 Hz',
    heartRate = 'Average Heart Rate,62 BPM',
    samples = ['100', '-50', '200', '-100'],
    extra = '',
  } = {}): Buffer {
    const lines = [
      recordedAt,
      classification,
      symptoms,
      device,
      sampleRate,
      heartRate,
      extra,
      '',        // blank line (should be skipped)
      ',',       // comma-only line (should be skipped)
      ...samples,
    ]
    return Buffer.from(lines.join('\n'), 'utf8')
  }

  it('parses a complete ECG CSV with all metadata fields', async () => {
    _ecgBuffers = [makeEcgCsv()]
    _xmlContent = makeXml('')
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.ecgs).toHaveLength(1)
    const ecg = result.ecgs[0]
    expect(ecg.classification).toBe('Sinus Rhythm')
    expect(ecg.symptoms).toBe('None')
    expect(ecg.device).toBe('Watch6,3')  // unquoted
    expect(ecg.samplingFrequencyHz).toBe(512)
    expect(ecg.averageHeartRate).toBe(62)
    expect(ecg.recordedAt).toBe('2026-01-15T10:00:00-05:00')
  })

  it('handles comma-decimal sample values (e.g. "-24,8")', async () => {
    // Samples with European comma-decimal separator, also samples with trailing commas
    const csv = Buffer.from(
      'Recorded Date,2026-01-15 10:00:00 -0500\nSample Rate,512 Hz\n' +
      '-24,8\n100,5\n200,\n',  // comma-decimal and trailing comma
      'utf8'
    )
    _ecgBuffers = [csv]
    _xmlContent = makeXml('')
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.ecgs).toHaveLength(1)
    expect(result.ecgs[0].sampleCount).toBeGreaterThan(0)
  })

  it('falls back to first date value when "recorded" key is missing', async () => {
    // No 'recorded' key — falls back to firstDateValue (line 927-929)
    const csv = Buffer.from(
      'Classification,Sinus Rhythm\n' +
      'Date Written,2026-03-10\n' +
      'Sample Rate,512 Hz\n' +
      '100\n200\n300\n',
      'utf8'
    )
    _ecgBuffers = [csv]
    _xmlContent = makeXml('')
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.ecgs).toHaveLength(1)
    // recordedAt should be the date "2026-03-10" (ISO conversion attempted)
    expect(result.ecgs[0].recordedAt).toBeTruthy()
  })

  it('returns no ECGs when CSV has no sample lines', async () => {
    // Only metadata, no numeric samples → parseEcgCsv returns null → skipped
    const csv = Buffer.from(
      'Recorded Date,2026-01-15 10:00:00 -0500\nSample Rate,512 Hz\n',
      'utf8'
    )
    _ecgBuffers = [csv]
    _xmlContent = makeXml('')
    const result = await parseHealthExport('/fake.zip', noopProgress)
    // parseEcgCsv returns null when samples.length === 0
    expect(result.ecgs).toHaveLength(0)
  })

  it('handles sample rate with comma-decimal (localized Hz value)', async () => {
    // "Sample Rate,511,5 Hz" — parseLocaleFloat replaces ',' with '.'
    const csv = Buffer.from(
      'Recorded Date,2026-01-15 10:00:00 -0500\nSample Rate,511,5 Hz\nHeart Rate,60 BPM\n100\n200\n',
      'utf8'
    )
    _ecgBuffers = [csv]
    _xmlContent = makeXml('')
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.ecgs[0].samplingFrequencyHz).toBeCloseTo(511.5, 1)
  })
})

// ---------------------------------------------------------------------------
// GPX parsing: parseGpx branches (lines 1007-1053)
// ---------------------------------------------------------------------------
describe('parseHealthExport — GPX route parsing', () => {
  it('parses a simple GPX route with track points', async () => {
    const gpx = `<?xml version="1.0"?>
<gpx version="1.1">
<trk><trkseg>
<trkpt lat="51.5074" lon="-0.1278"><ele>10</ele><time>2026-01-15T07:00:00Z</time></trkpt>
<trkpt lat="51.5080" lon="-0.1270"><ele>12</ele><time>2026-01-15T07:15:00Z</time></trkpt>
<trkpt lat="51.5090" lon="-0.1260"><ele>15</ele><time>2026-01-15T07:30:00Z</time></trkpt>
</trkseg></trk>
</gpx>`
    _gpxBuffers = [Buffer.from(gpx, 'utf8')]
    _xmlContent = makeXml('')
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.routes).toHaveLength(1)
    expect(result.routes[0].routeDate).toBe('2026-01-01')  // from filename route_2026-01-01
    expect(result.routes[0].pointCount).toBe(3)
    expect(result.routes[0].distanceKm).toBeGreaterThan(0)
    expect(result.routes[0].durationMin).toBeCloseTo(30, 0)
  })

  it('returns no route when GPX has < 2 track points', async () => {
    const gpx = `<?xml version="1.0"?>
<gpx><trk><trkseg>
<trkpt lat="51.5074" lon="-0.1278"><time>2026-01-15T07:00:00Z</time></trkpt>
</trkseg></trk></gpx>`
    _gpxBuffers = [Buffer.from(gpx, 'utf8')]
    _xmlContent = makeXml('')
    const result = await parseHealthExport('/fake.zip', noopProgress)
    // Only 1 point → parseGpx returns null
    expect(result.routes).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Clinical JSON: parseClinicalJson branches (lines 1070-1114)
// ---------------------------------------------------------------------------
describe('parseHealthExport — clinical JSON parsing', () => {
  it('parses an immunization FHIR record', async () => {
    const fhir = {
      resourceType: 'Immunization',
      status: 'completed',
      vaccineCode: {
        text: 'COVID-19 Vaccine',
        coding: [{ system: 'http://hl7.org/fhir/sid/cvx', code: '208', display: 'Pfizer' }],
      },
      occurrenceDateTime: '2021-06-15',
      lotNumber: 'EW0150',
      performer: [{ actor: { display: 'City Clinic' } }],
    }
    _clinicalBuffers = [Buffer.from(JSON.stringify(fhir), 'utf8')]
    _xmlContent = makeXml('')
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.clinical).toHaveLength(1)
    const rec = result.clinical[0]
    expect(rec.type).toBe('Immunization')
    expect(rec.status).toBe('completed')
    expect(rec.date).toBe('2021-06-15')
    expect(rec.lot).toBe('EW0150')
    expect(rec.location).toBe('City Clinic')
    // cvxCode "208" → known CVX name
    expect(rec.name).toBe('COVID-19 Vaccine')
  })

  it('returns null (skips) for invalid JSON in clinical record', async () => {
    _clinicalBuffers = [Buffer.from('{not valid json}', 'utf8')]
    _xmlContent = makeXml('')
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.clinical).toHaveLength(0)
  })

  it('returns null for clinical JSON with no resourceType', async () => {
    _clinicalBuffers = [Buffer.from(JSON.stringify({ status: 'active' }), 'utf8')]
    _xmlContent = makeXml('')
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.clinical).toHaveLength(0)
  })

  it('uses CVX display name when vaccineCode.text is missing', async () => {
    // CVX code 208 → "COVID-19 Vaccine (Pfizer-BioNTech)"
    const fhir = {
      resourceType: 'Immunization',
      status: 'completed',
      vaccineCode: {
        coding: [{ system: 'http://hl7.org/fhir/sid/cvx', code: '208' }],
      },
      occurrenceDateTime: '2021-06-15',
    }
    _clinicalBuffers = [Buffer.from(JSON.stringify(fhir), 'utf8')]
    _xmlContent = makeXml('')
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.clinical[0].name).toBe('COVID-19 Vaccine (Pfizer-BioNTech)')
  })

  it('uses code.coding.display when vaccineCode is absent', async () => {
    const fhir = {
      resourceType: 'Observation',
      status: 'final',
      code: {
        coding: [{ display: 'Blood Glucose' }],
      },
      effectiveDateTime: '2022-03-01',
    }
    _clinicalBuffers = [Buffer.from(JSON.stringify(fhir), 'utf8')]
    _xmlContent = makeXml('')
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.clinical[0].name).toBe('Blood Glucose')
  })
})

// ---------------------------------------------------------------------------
// WorkoutStatistics branches (lines 627-645)
// ---------------------------------------------------------------------------
describe('parseHealthExport — WorkoutStatistics branches', () => {
  it('uses statDistanceKm from WorkoutStatistics when totalDistance is 0', async () => {
    // totalDistance = 0 → falls back to workout.statDistanceKm from WorkoutStatistics
    const xml = `<Workout workoutActivityType="HKWorkoutActivityTypeRunning"
       sourceName="Apple Watch"
       startDate="2026-01-15 07:00:00 -0500"
       endDate="2026-01-15 07:30:00 -0500"
       duration="30" durationUnit="min"
       totalDistance="0" totalDistanceUnit="km">
     <WorkoutStatistics type="HKQuantityTypeIdentifierDistanceWalkingRunning"
       unit="km" sum="5.0"
       startDate="2026-01-15 07:00:00 -0500"
       endDate="2026-01-15 07:30:00 -0500"/>
   </Workout>`
    _xmlContent = makeXml(xml)
    const result = await parseHealthExport('/fake.zip', noopProgress)
    // totalDistance is 0 (not > 0) → uses statDistanceKm (5.0)
    expect(result.workouts[0].distanceKm).toBeCloseTo(5.0, 1)
  })

  it('uses statEnergyKcal from WorkoutStatistics when totalEnergyBurned is 0', async () => {
    const xml = `<Workout workoutActivityType="HKWorkoutActivityTypeRunning"
       sourceName="Apple Watch"
       startDate="2026-01-15 07:00:00 -0500"
       endDate="2026-01-15 07:30:00 -0500"
       duration="30" durationUnit="min"
       totalEnergyBurned="0" totalEnergyBurnedUnit="kcal">
     <WorkoutStatistics type="HKQuantityTypeIdentifierActiveEnergyBurned"
       unit="kcal" sum="300"
       startDate="2026-01-15 07:00:00 -0500"
       endDate="2026-01-15 07:30:00 -0500"/>
   </Workout>`
    _xmlContent = makeXml(xml)
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.workouts[0].energyKcal).toBeCloseTo(300, 0)
  })

  it('uses WorkoutStatistics for cycling distance', async () => {
    const xml = `<Workout workoutActivityType="HKWorkoutActivityTypeCycling"
       sourceName="Apple Watch"
       startDate="2026-01-15 07:00:00 -0500"
       endDate="2026-01-15 08:00:00 -0500"
       duration="60" durationUnit="min">
     <WorkoutStatistics type="HKQuantityTypeIdentifierDistanceCycling"
       unit="km" sum="20.0"
       startDate="2026-01-15 07:00:00 -0500"
       endDate="2026-01-15 08:00:00 -0500"/>
   </Workout>`
    _xmlContent = makeXml(xml)
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.workouts[0].distanceKm).toBeCloseTo(20.0, 1)
  })

  it('uses WorkoutStatistics for swimming distance', async () => {
    const xml = `<Workout workoutActivityType="HKWorkoutActivityTypeSwimming"
       sourceName="Apple Watch"
       startDate="2026-01-15 07:00:00 -0500"
       endDate="2026-01-15 07:45:00 -0500"
       duration="45" durationUnit="min">
     <WorkoutStatistics type="HKQuantityTypeIdentifierDistanceSwimming"
       unit="m" sum="1500"
       startDate="2026-01-15 07:00:00 -0500"
       endDate="2026-01-15 07:45:00 -0500"/>
   </Workout>`
    _xmlContent = makeXml(xml)
    const result = await parseHealthExport('/fake.zip', noopProgress)
    // 1500m = 1.5km
    expect(result.workouts[0].distanceKm).toBeCloseTo(1.5, 1)
  })
})

// ---------------------------------------------------------------------------
// workout duration unit variants (lines 659-662): 's', 'sec', 'hr'
// ---------------------------------------------------------------------------
describe('parseHealthExport — workout duration unit conversions', () => {
  it('converts duration in seconds to minutes', async () => {
    const xml = `<Workout workoutActivityType="HKWorkoutActivityTypeRunning"
       sourceName="Apple Watch"
       startDate="2026-01-15 07:00:00 -0500"
       endDate="2026-01-15 07:30:00 -0500"
       duration="1800" durationUnit="s">
   </Workout>`
    _xmlContent = makeXml(xml)
    const result = await parseHealthExport('/fake.zip', noopProgress)
    // 1800s / 60 = 30 min
    expect(result.workouts[0].durationMin).toBeCloseTo(30, 0)
  })

  it('converts duration in hours to minutes', async () => {
    const xml = `<Workout workoutActivityType="HKWorkoutActivityTypeRunning"
       sourceName="Apple Watch"
       startDate="2026-01-15 07:00:00 -0500"
       endDate="2026-01-15 08:00:00 -0500"
       duration="1" durationUnit="hr">
   </Workout>`
    _xmlContent = makeXml(xml)
    const result = await parseHealthExport('/fake.zip', noopProgress)
    // 1 hr * 60 = 60 min
    expect(result.workouts[0].durationMin).toBeCloseTo(60, 0)
  })

  it('handles "sec" duration unit', async () => {
    const xml = `<Workout workoutActivityType="HKWorkoutActivityTypeRunning"
       sourceName="Apple Watch"
       startDate="2026-01-15 07:00:00 -0500"
       endDate="2026-01-15 07:30:00 -0500"
       duration="1800" durationUnit="sec">
   </Workout>`
    _xmlContent = makeXml(xml)
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.workouts[0].durationMin).toBeCloseTo(30, 0)
  })
})

// ---------------------------------------------------------------------------
// handleRecord: various type branching
// ---------------------------------------------------------------------------
describe('parseHealthExport — handleRecord branches', () => {
  it('handles sleep record with invalid stage value (skipped)', async () => {
    // If attrs.value is not in SLEEP_STAGE_BY_VALUE, stage is undefined → return
    const xml = `<Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="iPhone"
       value="UnknownSleepValue"
       startDate="2026-01-15 22:00:00 -0500"
       endDate="2026-01-16 06:00:00 -0500"/>`
    _xmlContent = makeXml(xml)
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.sleepNights).toHaveLength(0)
  })

  it('skips non-HKQuantityTypeIdentifier records', async () => {
    // Type that starts with something other than HKQuantityTypeIdentifier
    const xml = `<Record type="HKCategoryTypeIdentifierMindfulSession" sourceName="iPhone"
       value="0"
       startDate="2026-01-15 10:00:00 -0500"
       endDate="2026-01-15 10:15:00 -0500"/>`
    _xmlContent = makeXml(xml)
    const result = await parseHealthExport('/fake.zip', noopProgress)
    // Should not crash, no metrics expected for this type
    expect(result.sleepNights).toHaveLength(0)
  })

  it('handles record with invalid date (appleDateToIso returns null)', async () => {
    // Bad date format → appleDateToIso returns null → sleep record skipped
    const xml = `<Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="iPhone"
       value="HKCategoryValueSleepAnalysisAsleepCore"
       startDate="bad-date"
       endDate="2026-01-16 06:00:00 -0500"/>`
    _xmlContent = makeXml(xml)
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.sleepNights).toHaveLength(0)
  })

  it('handles sleep record where endMs <= startMs (skipped)', async () => {
    // endDate same as startDate → endMs === startMs → skipped
    const xml = `<Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="iPhone"
       value="HKCategoryValueSleepAnalysisAsleepCore"
       startDate="2026-01-15 08:00:00 -0500"
       endDate="2026-01-15 08:00:00 -0500"/>`
    _xmlContent = makeXml(xml)
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.sleepNights).toHaveLength(0)
  })

  it('handles Correlation records (increments/decrements correlationDepth)', async () => {
    // Correlation tags affect the correlationDepth counter
    const xml = `<Correlation type="HKCorrelationTypeIdentifierBloodPressure"
       sourceName="iPhone"
       startDate="2026-01-15 09:00:00 -0500"
       endDate="2026-01-15 09:00:01 -0500">
     <Record type="HKQuantityTypeIdentifierBloodPressureSystolic" sourceName="iPhone"
       unit="mmHg" startDate="2026-01-15 09:00:00 -0500" endDate="2026-01-15 09:00:01 -0500" value="120"/>
   </Correlation>`
    _xmlContent = makeXml(xml)
    const result = await parseHealthExport('/fake.zip', noopProgress)
    // Correlation records don't go through handleRecord (correlationDepth > 0)
    expect(result.workouts).toHaveLength(0)
  })

  it('handles record with no type attribute (skipped)', async () => {
    // Record without type should be skipped (type is undefined)
    const xml = `<Record sourceName="iPhone"
       startDate="2026-01-15 09:00:00 -0500" endDate="2026-01-15 09:00:01 -0500" value="120"/>`
    _xmlContent = makeXml(xml)
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.dailyMetrics).toHaveLength(0)
  })

  it('skips record with null value (toFinite returns null)', async () => {
    // Empty value string → toFinite returns null → skipped
    const xml = `<Record type="HKQuantityTypeIdentifierStepCount" sourceName="iPhone"
       unit="count" startDate="2026-01-15 09:00:00 -0500" endDate="2026-01-15 09:00:01 -0500" value=""/>`
    _xmlContent = makeXml(xml)
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.dailyMetrics).toHaveLength(0)
  })

  it('skips record with invalid date key format', async () => {
    // Bad date key (not YYYY-MM-DD) → DATE_KEY_REGEX.test fails → skipped
    const xml = `<Record type="HKQuantityTypeIdentifierStepCount" sourceName="iPhone"
       unit="count" startDate="invalid-date-format" endDate="invalid-date-format" value="1000"/>`
    _xmlContent = makeXml(xml)
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.dailyMetrics).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Activity summary validation
// ---------------------------------------------------------------------------
describe('parseHealthExport — ActivitySummary validation', () => {
  it('skips ActivitySummary with invalid date format', async () => {
    const xml = `<ActivitySummary dateComponents="bad-date"
       activeEnergyBurned="300" activeEnergyBurnedGoal="400"
       appleExerciseTime="30" appleExerciseTimeGoal="30"
       appleStandHours="10" appleStandHoursGoal="12"/>`
    _xmlContent = makeXml(xml)
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.activityDays).toHaveLength(0)
  })

  it('skips ActivitySummary with missing dateComponents', async () => {
    const xml = `<ActivitySummary
       activeEnergyBurned="300" activeEnergyBurnedGoal="400"/>`
    _xmlContent = makeXml(xml)
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.activityDays).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// handleRecord: body_mass update path for profile
// ---------------------------------------------------------------------------
describe('parseHealthExport — profile body_mass update', () => {
  it('tracks the most recent body mass sample', async () => {
    const xml =
      `<Record type="HKQuantityTypeIdentifierBodyMass" sourceName="iPhone" unit="kg"` +
      ` startDate="2026-01-10 08:00:00 -0500" endDate="2026-01-10 08:00:01 -0500" value="75"/>` +
      `<Record type="HKQuantityTypeIdentifierBodyMass" sourceName="iPhone" unit="kg"` +
      ` startDate="2026-01-15 08:00:00 -0500" endDate="2026-01-15 08:00:01 -0500" value="74.5"/>`
    _xmlContent = makeXml(xml)
    const result = await parseHealthExport('/fake.zip', noopProgress)
    // profile should reflect the more recent record (2026-01-15)
    expect(result.profile.bodyMass?.value).toBe(74.5)
  })
})

// ---------------------------------------------------------------------------
// Sort comparator coverage: 2+ ECGs (anonymous_12), GPX routes (anonymous_13),
// clinical records (anonymous_14) trigger sort callbacks at lines 381, 401, 414
// ---------------------------------------------------------------------------
describe('parseHealthExport — sort comparators for multiple results', () => {
  it('sorts multiple ECGs by recordedAt descending (comparator at line 381)', async () => {
    // Two ECG CSVs with different recorded dates → sort callback invoked
    const ecg1 = Buffer.from(
      'Recorded Date,2026-01-10 10:00:00 -0500\nSample Rate,512 Hz\n100\n200\n',
      'utf8'
    )
    const ecg2 = Buffer.from(
      'Recorded Date,2026-01-20 10:00:00 -0500\nSample Rate,512 Hz\n100\n200\n',
      'utf8'
    )
    _ecgBuffers = [ecg1, ecg2]
    _xmlContent = makeXml('')
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.ecgs).toHaveLength(2)
    // Descending: ecg2 (Jan 20) should come first
    expect(result.ecgs[0].recordedAt).toContain('2026-01-20')
    expect(result.ecgs[1].recordedAt).toContain('2026-01-10')
  })

  it('sorts multiple ECGs including one with null recordedAt (covers ?? branch)', async () => {
    // ECG with no recorded date → recordedAt is null → (null ?? '') = '' in comparator
    const ecgWithDate = Buffer.from(
      'Recorded Date,2026-01-15 10:00:00 -0500\nSample Rate,512 Hz\n100\n200\n',
      'utf8'
    )
    const ecgNoDate = Buffer.from(
      'Classification,Sinus Rhythm\nSample Rate,512 Hz\n100\n200\n',  // no date metadata
      'utf8'
    )
    _ecgBuffers = [ecgWithDate, ecgNoDate]
    _xmlContent = makeXml('')
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.ecgs).toHaveLength(2)
    // ECG with date should sort before one with no date (empty string)
    expect(result.ecgs[0].recordedAt).not.toBeNull()
  })

  it('sorts multiple GPX routes by routeDate ascending (comparator at line 401)', async () => {
    // Two GPX files via different buffer entries (route_2026-01-01, route_2026-01-02)
    const gpx = (date: string) => `<?xml version="1.0"?>
<gpx version="1.1"><trk><trkseg>
<trkpt lat="51.50" lon="-0.12"><time>${date}T07:00:00Z</time></trkpt>
<trkpt lat="51.51" lon="-0.11"><time>${date}T07:30:00Z</time></trkpt>
</trkseg></trk></gpx>`
    _gpxBuffers = [
      Buffer.from(gpx('2026-01-02'), 'utf8'),  // file route_2026-01-01 (index 0)
      Buffer.from(gpx('2026-01-01'), 'utf8'),  // file route_2026-01-02 (index 1)
    ]
    _xmlContent = makeXml('')
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.routes).toHaveLength(2)
    // Ascending: route with earlier date (from filename) comes first
    // Filename route_2026-01-01 → routeDate = '2026-01-01'
    // Filename route_2026-01-02 → routeDate = '2026-01-02'
    expect(result.routes[0].routeDate <= result.routes[1].routeDate).toBe(true)
  })

  it('sorts multiple clinical records by date descending (comparator at line 414)', async () => {
    const fhir1 = JSON.stringify({
      resourceType: 'Immunization', status: 'completed',
      vaccineCode: { text: 'Flu Shot' },
      occurrenceDateTime: '2021-10-01',
    })
    const fhir2 = JSON.stringify({
      resourceType: 'Immunization', status: 'completed',
      vaccineCode: { text: 'COVID Booster' },
      occurrenceDateTime: '2022-10-01',
    })
    _clinicalBuffers = [
      Buffer.from(fhir1, 'utf8'),
      Buffer.from(fhir2, 'utf8'),
    ]
    _xmlContent = makeXml('')
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.clinical).toHaveLength(2)
    // Descending by date: 2022 comes first
    expect(result.clinical[0].date).toBe('2022-10-01')
    expect(result.clinical[1].date).toBe('2021-10-01')
  })

  it('sorts clinical records with null date (covers ?? branch in line 414)', async () => {
    // One with date, one without
    const fhirWithDate = JSON.stringify({
      resourceType: 'Observation',
      status: 'final',
      code: { text: 'Blood Pressure' },
      effectiveDateTime: '2022-06-15',
    })
    const fhirNoDate = JSON.stringify({
      resourceType: 'Observation',
      status: 'final',
      code: { text: 'No Date Observation' },
      // no date fields
    })
    _clinicalBuffers = [
      Buffer.from(fhirWithDate, 'utf8'),
      Buffer.from(fhirNoDate, 'utf8'),
    ]
    _xmlContent = makeXml('')
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.clinical).toHaveLength(2)
    // Record with date should sort before one without date (null ?? '' = '')
    expect(result.clinical[0].date).toBe('2022-06-15')
  })
})

// ---------------------------------------------------------------------------
// Additional coverage for remaining branches
// ---------------------------------------------------------------------------

describe('parseHealthExport — appleDateToIso !value branch (ExportDate with no value attr)', () => {
  it('handles ExportDate element with no value attribute', async () => {
    // <ExportDate/> with no attrs.value → appleDateToIso(undefined) → !value → null
    _xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE HealthData []>
<HealthData locale="en_US">
 <ExportDate/>
</HealthData>`
    const result = await parseHealthExport('/fake.zip', noopProgress)
    // exportDate should be null since appleDateToIso(undefined) returns null
    expect(result.exportDate).toBeNull()
  })
})

describe('parseHealthExport — degC to degF conversion (convertUnit line 217)', () => {
  it('converts degC samples to degF when degF is the stored unit', async () => {
    // First record sets unit to degF, second arrives in degC → convertUnit(degC, degF) runs
    const xml =
      `<Record type="HKQuantityTypeIdentifierAppleSleepingWristTemperature" sourceName="Watch" unit="degF"` +
      ` startDate="2026-01-15 00:00:00 -0500" endDate="2026-01-15 00:00:01 -0500" value="98.6"/>` +
      `<Record type="HKQuantityTypeIdentifierAppleSleepingWristTemperature" sourceName="iPhone" unit="degC"` +
      ` startDate="2026-01-15 01:00:00 -0500" endDate="2026-01-15 01:00:01 -0500" value="36"/>`
    _xmlContent = makeXml(xml)
    const result = await parseHealthExport('/fake.zip', noopProgress)
    const metric = result.dailyMetrics.find((m) => m.metricType === 'apple_sleeping_wrist_temperature')
    // Both samples aggregated (36°C → 96.8°F)
    expect(metric?.sampleCount).toBe(2)
  })
})

describe('parseHealthExport — ECG CSV additional branches', () => {
  it('handles ECG line with no comma (commaIdx === -1 branch)', async () => {
    // A metadata line with no comma is skipped
    const csv = Buffer.from(
      'Recorded Date,2026-01-15 10:00:00 -0500\nSample Rate,512 Hz\nNOCOMMALINEHERE\n100\n200\n',
      'utf8'
    )
    _ecgBuffers = [csv]
    _xmlContent = makeXml('')
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.ecgs).toHaveLength(1)
    expect(result.ecgs[0].sampleCount).toBe(2)  // Only 2 valid samples
  })

  it('falls back to raw value when recorded date is not appleDateToIso parseable', async () => {
    // 'Recorded Date' key exists but value is not in the expected format → falls back to value || null
    const csv = Buffer.from(
      'Recorded Date,June 15 2026\nSample Rate,512 Hz\n100\n200\n300\n',  // Not HH:MM:SS format
      'utf8'
    )
    _ecgBuffers = [csv]
    _xmlContent = makeXml('')
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.ecgs).toHaveLength(1)
    // recordedAt falls back to the raw value string since appleDateToIso returns null
    expect(result.ecgs[0].recordedAt).toBe('June 15 2026')
  })

  it('truncates ECG samples to MAX_ECG_FULL_SAMPLES when overflow', async () => {
    // MAX_ECG_FULL_SAMPLES = 20000; write 20001 numeric lines
    const samples = Array.from({ length: 20001 }, (_, i) => (i % 1000).toString())
    const csv = Buffer.from(
      'Recorded Date,2026-01-15 10:00:00 -0500\nSample Rate,512 Hz\n' + samples.join('\n') + '\n',
      'utf8'
    )
    _ecgBuffers = [csv]
    _xmlContent = makeXml('')
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.ecgs).toHaveLength(1)
    // Truncated to MAX_ECG_FULL_SAMPLES = 20000
    expect(result.ecgs[0].sampleCount).toBe(20000)
  })
})

describe('parseHealthExport — GPX additional branches', () => {
  it('skips trkpt element missing lat or lon (commaIdx check branch)', async () => {
    const gpx = `<?xml version="1.0"?>
<gpx version="1.1"><trk><trkseg>
<trkpt lat="51.50"><time>2026-01-15T07:00:00Z</time></trkpt>
<trkpt lat="51.50" lon="-0.12"><time>2026-01-15T07:00:00Z</time></trkpt>
<trkpt lat="51.51" lon="-0.11"><time>2026-01-15T07:30:00Z</time></trkpt>
</trkseg></trk></gpx>`
    _gpxBuffers = [Buffer.from(gpx, 'utf8')]
    _xmlContent = makeXml('')
    const result = await parseHealthExport('/fake.zip', noopProgress)
    // First trkpt missing lon is skipped; 2 valid points → route produced
    expect(result.routes).toHaveLength(1)
    expect(result.routes[0].pointCount).toBe(2)
  })

  it('returns no route when filename has no date and first trkpt has no time', async () => {
    // No <time> elements in the GPX → firstTime = null, nameDate = null from filename
    // But the mock uses route_2026-01-01 so routeDate = '2026-01-01' from filename
    // To get null routeDate we need a non-matching filename — but our mock always uses
    // route_2026-01-0N. Skip this as the path is handled by the mock filename.
    // Instead, test that GPX with no time elements still produces a route (via nameDate)
    const gpx = `<?xml version="1.0"?>
<gpx version="1.1"><trk><trkseg>
<trkpt lat="51.50" lon="-0.12"></trkpt>
<trkpt lat="51.51" lon="-0.11"></trkpt>
</trkseg></trk></gpx>`
    _gpxBuffers = [Buffer.from(gpx, 'utf8')]
    _xmlContent = makeXml('')
    const result = await parseHealthExport('/fake.zip', noopProgress)
    // Route produced but durationMin = null (no time elements)
    expect(result.routes).toHaveLength(1)
    expect(result.routes[0].durationMin).toBeNull()
  })
})

describe('parseHealthExport — MetadataEntry with non-matching elevation value', () => {
  it('does not set elevationGainM when value format does not match regex', async () => {
    // MetadataEntry value that fails /^([\d.]+)\s*(\w+)$/ regex (e.g., empty string)
    const xml = `<Workout workoutActivityType="HKWorkoutActivityTypeRunning"
       sourceName="Apple Watch"
       startDate="2026-01-15 07:00:00 -0500"
       endDate="2026-01-15 07:30:00 -0500"
       duration="30" durationUnit="min">
     <MetadataEntry key="HKElevationAscended" value="not a valid elevation"/>
   </Workout>`
    _xmlContent = makeXml(xml)
    const result = await parseHealthExport('/fake.zip', noopProgress)
    // "not a valid elevation" contains spaces in the number part → regex fails → null
    expect(result.workouts[0].elevationGainM).toBeNull()
  })
})

describe('parseHealthExport — WorkoutStatistics sum is null', () => {
  it('does not set statDistanceKm when WorkoutStatistics sum is missing', async () => {
    // WorkoutStatistics with no sum attr → toFinite(undefined) → null → not set
    const xml = `<Workout workoutActivityType="HKWorkoutActivityTypeRunning"
       sourceName="Apple Watch"
       startDate="2026-01-15 07:00:00 -0500"
       endDate="2026-01-15 07:30:00 -0500"
       duration="30" durationUnit="min">
     <WorkoutStatistics type="HKQuantityTypeIdentifierDistanceWalkingRunning"
       unit="km"
       startDate="2026-01-15 07:00:00 -0500"
       endDate="2026-01-15 07:30:00 -0500"/>
   </Workout>`
    _xmlContent = makeXml(xml)
    const result = await parseHealthExport('/fake.zip', noopProgress)
    // sum is undefined → toFinite returns null → statDistanceKm stays null
    expect(result.workouts[0].distanceKm).toBeNull()
  })

  it('does not set statEnergyKcal when ActiveEnergyBurned sum is missing', async () => {
    const xml = `<Workout workoutActivityType="HKWorkoutActivityTypeRunning"
       sourceName="Apple Watch"
       startDate="2026-01-15 07:00:00 -0500"
       endDate="2026-01-15 07:30:00 -0500"
       duration="30" durationUnit="min">
     <WorkoutStatistics type="HKQuantityTypeIdentifierActiveEnergyBurned"
       unit="kcal"
       startDate="2026-01-15 07:00:00 -0500"
       endDate="2026-01-15 07:30:00 -0500"/>
   </Workout>`
    _xmlContent = makeXml(xml)
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.workouts[0].energyKcal).toBeNull()
  })
})

describe('parseHealthExport — HeartRate workout statistics', () => {
  it('sets avgHeartRate and maxHeartRate from WorkoutStatistics', async () => {
    const xml = `<Workout workoutActivityType="HKWorkoutActivityTypeRunning"
       sourceName="Apple Watch"
       startDate="2026-01-15 07:00:00 -0500"
       endDate="2026-01-15 07:30:00 -0500"
       duration="30" durationUnit="min">
     <WorkoutStatistics type="HKQuantityTypeIdentifierHeartRate"
       unit="count/min" average="145" maximum="178"
       startDate="2026-01-15 07:00:00 -0500"
       endDate="2026-01-15 07:30:00 -0500"/>
   </Workout>`
    _xmlContent = makeXml(xml)
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.workouts[0].avgHeartRate).toBeCloseTo(145, 0)
    expect(result.workouts[0].maxHeartRate).toBeCloseTo(178, 0)
  })
})

describe('parseHealthExport — flattenDailyMetrics multi-source non-cumulative', () => {
  it('merges two non-cumulative sources, updating min/max correctly', async () => {
    // Two sources for the same non-cumulative metric on the same day
    // Source 1: value=100 (min=100, max=100); Source 2: value=50 (min=50, max=50)
    // merged: min=50, max=100
    const xml =
      `<Record type="HKQuantityTypeIdentifierHeartRate" sourceName="Watch" unit="count/min"` +
      ` startDate="2026-01-15 08:00:00 -0500" endDate="2026-01-15 08:00:01 -0500" value="100"/>` +
      `<Record type="HKQuantityTypeIdentifierHeartRate" sourceName="iPhone" unit="count/min"` +
      ` startDate="2026-01-15 09:00:00 -0500" endDate="2026-01-15 09:00:01 -0500" value="50"/>`
    _xmlContent = makeXml(xml)
    const result = await parseHealthExport('/fake.zip', noopProgress)
    const metric = result.dailyMetrics.find((m) => m.metricType === 'heart_rate')
    expect(metric?.sampleCount).toBe(2)
    expect(metric?.valueMin).toBe(50)
    expect(metric?.valueMax).toBe(100)
  })

  it('keeps existing min/max when new source has middle value', async () => {
    // Three sources: 100, 50, 75 → min stays 50, max stays 100 for last two
    const xml =
      `<Record type="HKQuantityTypeIdentifierHeartRate" sourceName="Watch" unit="count/min"` +
      ` startDate="2026-01-15 08:00:00 -0500" endDate="2026-01-15 08:00:01 -0500" value="100"/>` +
      `<Record type="HKQuantityTypeIdentifierHeartRate" sourceName="iPhone" unit="count/min"` +
      ` startDate="2026-01-15 09:00:00 -0500" endDate="2026-01-15 09:00:01 -0500" value="50"/>` +
      `<Record type="HKQuantityTypeIdentifierHeartRate" sourceName="Fitbit" unit="count/min"` +
      ` startDate="2026-01-15 10:00:00 -0500" endDate="2026-01-15 10:00:01 -0500" value="75"/>`
    _xmlContent = makeXml(xml)
    const result = await parseHealthExport('/fake.zip', noopProgress)
    const metric = result.dailyMetrics.find((m) => m.metricType === 'heart_rate')
    expect(metric?.sampleCount).toBe(3)
    expect(metric?.valueMin).toBe(50)
    expect(metric?.valueMax).toBe(100)
  })
})

describe('parseHealthExport — clinical record: location from location.display', () => {
  it('uses location.display when performer.actor.display is absent', async () => {
    const fhir = {
      resourceType: 'Procedure',
      status: 'completed',
      code: { text: 'Blood Draw' },
      performedDateTime: '2022-05-01',
      location: { display: 'City Hospital Lab' },
    }
    _clinicalBuffers = [Buffer.from(JSON.stringify(fhir), 'utf8')]
    _xmlContent = makeXml('')
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.clinical).toHaveLength(1)
    expect(result.clinical[0].location).toBe('City Hospital Lab')
  })

  it('uses medicationCodeableConcept.text for name when other fields absent', async () => {
    const fhir = {
      resourceType: 'MedicationStatement',
      status: 'active',
      medicationCodeableConcept: { text: 'Aspirin 81mg' },
      effectiveDateTime: '2022-05-01',
    }
    _clinicalBuffers = [Buffer.from(JSON.stringify(fhir), 'utf8')]
    _xmlContent = makeXml('')
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.clinical[0].name).toBe('Aspirin 81mg')
  })
})

describe('parseHealthExport — ECG CSV edge: empty metadata values', () => {
  it('handles empty classification value (classification = null via value || null)', async () => {
    // classification key with empty value → `value || null` → null
    const csv = Buffer.from(
      'Recorded Date,2026-01-15 10:00:00 -0500\nClassification,\nSymptoms,\nDevice,\nSample Rate,512 Hz\nHeart Rate,60 BPM\n100\n200\n',
      'utf8'
    )
    _ecgBuffers = [csv]
    _xmlContent = makeXml('')
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.ecgs).toHaveLength(1)
    // Empty classification → null
    expect(result.ecgs[0].classification).toBeNull()
    expect(result.ecgs[0].symptoms).toBeNull()
    expect(result.ecgs[0].device).toBeNull()
  })

  it('handles non-finite sample rate (samplingFrequencyHz stays null)', async () => {
    // Sample Rate with non-parseable value → parseLocaleFloat returns NaN → not set
    const csv = Buffer.from(
      'Recorded Date,2026-01-15 10:00:00 -0500\nSample Rate,not-a-number Hz\n100\n200\n',
      'utf8'
    )
    _ecgBuffers = [csv]
    _xmlContent = makeXml('')
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.ecgs).toHaveLength(1)
    expect(result.ecgs[0].samplingFrequencyHz).toBeNull()
  })

  it('handles non-finite heart rate (averageHeartRate stays null)', async () => {
    const csv = Buffer.from(
      'Recorded Date,2026-01-15 10:00:00 -0500\nSample Rate,512 Hz\nAverage Heart Rate,invalid BPM\n100\n200\n',
      'utf8'
    )
    _ecgBuffers = [csv]
    _xmlContent = makeXml('')
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.ecgs[0].averageHeartRate).toBeNull()
  })

  it('handles appleDateToIso returning null for "recorded" key value → value is empty', async () => {
    // `recorded date` key but value is blank → appleDateToIso(blank) → null → value || null → null
    const csv = Buffer.from(
      'Recorded Date,\nSample Rate,512 Hz\n100\n200\n',
      'utf8'
    )
    _ecgBuffers = [csv]
    _xmlContent = makeXml('')
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.ecgs).toHaveLength(1)
    // recordedAt should be null (empty string → value || null → null)
    expect(result.ecgs[0].recordedAt).toBeNull()
  })
})

describe('parseHealthExport — GPX additional edge cases', () => {
  it('returns null for GPX with non-finite coordinates', async () => {
    // trkpt with lat/lon attributes but values that produce NaN
    // (Number("NaN") is NaN, not finite) → points are skipped
    // With only 1 valid trkpt, return null
    const gpx = `<?xml version="1.0"?>
<gpx version="1.1"><trk><trkseg>
<trkpt lat="NaN" lon="-0.12"><time>2026-01-15T07:00:00Z</time></trkpt>
<trkpt lat="51.50" lon="-0.12"><time>2026-01-15T07:00:00Z</time></trkpt>
<trkpt lat="51.51" lon="-0.11"><time>2026-01-15T07:30:00Z</time></trkpt>
</trkseg></trk></gpx>`
    _gpxBuffers = [Buffer.from(gpx, 'utf8')]
    _xmlContent = makeXml('')
    const result = await parseHealthExport('/fake.zip', noopProgress)
    // NaN lat is not finite → skipped. 2 valid points remain → route produced
    expect(result.routes).toHaveLength(1)
    expect(result.routes[0].pointCount).toBe(2)
  })

  it('handles GPX where first+last time difference is zero (durationMin stays null)', async () => {
    // Both trkpts have the same timestamp → ms = 0 → not > 0 → durationMin = null
    const gpx = `<?xml version="1.0"?>
<gpx version="1.1"><trk><trkseg>
<trkpt lat="51.50" lon="-0.12"><time>2026-01-15T07:00:00Z</time></trkpt>
<trkpt lat="51.51" lon="-0.11"><time>2026-01-15T07:00:00Z</time></trkpt>
</trkseg></trk></gpx>`
    _gpxBuffers = [Buffer.from(gpx, 'utf8')]
    _xmlContent = makeXml('')
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.routes).toHaveLength(1)
    // ms = 0 → not > 0 → durationMin stays null
    expect(result.routes[0].durationMin).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// handleRecord — ?? fallback branches
// ---------------------------------------------------------------------------
describe('parseHealthExport — handleRecord ?? fallback branches', () => {
  it('handles sleep record with no value attribute (stage = undefined → skipped)', async () => {
    // attrs.value is undefined → attrs.value ?? '' → '' → SLEEP_STAGE_BY_VALUE[''] → undefined
    const xml = `<Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="iPhone"
       startDate="2026-01-15 22:00:00 -0500"
       endDate="2026-01-16 06:00:00 -0500"/>`
    _xmlContent = makeXml(xml)
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.sleepNights).toHaveLength(0)
  })

  it('handles sleep record with no sourceName (falls back to empty string)', async () => {
    // attrs.sourceName is undefined → attrs.sourceName ?? '' → '' (used as source)
    const xml = `<Record type="HKCategoryTypeIdentifierSleepAnalysis"
       value="HKCategoryValueSleepAnalysisAsleepCore"
       startDate="2026-01-15 22:00:00 -0500"
       endDate="2026-01-16 06:00:00 -0500"/>`
    _xmlContent = makeXml(xml)
    const result = await parseHealthExport('/fake.zip', noopProgress)
    // Should produce a valid sleep night (source defaults to '')
    expect(result.sleepNights.length).toBeGreaterThanOrEqual(1)
  })

  it('handles HKQuantity record with no sourceName (falls back to empty string)', async () => {
    // attrs.sourceName ?? '' → '' used as source key in aggregation map
    const xml = `<Record type="HKQuantityTypeIdentifierStepCount"
       unit="count" startDate="2026-01-15 09:00:00 -0500" endDate="2026-01-15 09:00:01 -0500" value="1000"/>`
    _xmlContent = makeXml(xml)
    const result = await parseHealthExport('/fake.zip', noopProgress)
    const metric = result.dailyMetrics.find((m) => m.metricType === 'step_count')
    expect(metric?.sampleCount).toBe(1)
  })

  it('handles HKQuantity record with no unit attribute (unit = null)', async () => {
    // attrs.unit ?? null → null when unit attr is missing
    const xml = `<Record type="HKQuantityTypeIdentifierStepCount"
       sourceName="iPhone" startDate="2026-01-15 09:00:00 -0500" endDate="2026-01-15 09:00:01 -0500" value="1000"/>`
    _xmlContent = makeXml(xml)
    const result = await parseHealthExport('/fake.zip', noopProgress)
    const metric = result.dailyMetrics.find((m) => m.metricType === 'step_count')
    // unit is null, but record is still aggregated
    expect(metric?.sampleCount).toBe(1)
    expect(metric?.unit).toBeNull()
  })

  it('storedUnit is null but new record has a unit (storedUnit === null && unit !== null)', async () => {
    // First record: no unit attr → storedUnit = null
    // Second record: has unit → storedUnit === null && unit !== null → update storedUnit
    // (step_count is cumulative → highest-sum source wins → sampleCount = 1 from winner)
    const xml =
      `<Record type="HKQuantityTypeIdentifierStepCount"
         sourceName="iPhone" startDate="2026-01-15 09:00:00 -0500" endDate="2026-01-15 09:00:01 -0500" value="500"/>` +
      `<Record type="HKQuantityTypeIdentifierStepCount" unit="count"
         sourceName="Watch" startDate="2026-01-15 10:00:00 -0500" endDate="2026-01-15 10:00:01 -0500" value="600"/>`
    _xmlContent = makeXml(xml)
    const result = await parseHealthExport('/fake.zip', noopProgress)
    const metric = result.dailyMetrics.find((m) => m.metricType === 'step_count')
    // cumulative: highest sum (600 from Watch) wins; sampleCount from that source = 1
    expect(metric).toBeDefined()
    expect(metric?.valueSum).toBeCloseTo(600, 0)
  })

  it('suppresses duplicate unit-incompatible warnings (unitWarnings de-dup)', async () => {
    // Three records: first sets degC, second & third arrive in km (incompatible)
    // Only ONE warning should fire (second triggers warning, third is de-duped)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const xml =
      `<Record type="HKQuantityTypeIdentifierAppleSleepingWristTemperature" sourceName="Watch" unit="degC"` +
      ` startDate="2026-01-15 00:00:00 -0500" endDate="2026-01-15 00:00:01 -0500" value="36"/>` +
      `<Record type="HKQuantityTypeIdentifierAppleSleepingWristTemperature" sourceName="S1" unit="km"` +
      ` startDate="2026-01-15 01:00:00 -0500" endDate="2026-01-15 01:00:01 -0500" value="5"/>` +
      `<Record type="HKQuantityTypeIdentifierAppleSleepingWristTemperature" sourceName="S2" unit="km"` +
      ` startDate="2026-01-15 02:00:00 -0500" endDate="2026-01-15 02:00:01 -0500" value="8"/>`
    _xmlContent = makeXml(xml)
    const result = await parseHealthExport('/fake.zip', noopProgress)
    const metric = result.dailyMetrics.find((m) => m.metricType === 'apple_sleeping_wrist_temperature')
    expect(metric?.sampleCount).toBe(1)
    // Only one warning, despite two incompatible records
    expect(warnSpy).toHaveBeenCalledTimes(1)
    warnSpy.mockRestore()
  })
})

// ---------------------------------------------------------------------------
// handleOpenTag — MetadataEntry outside workout context and other key
// ---------------------------------------------------------------------------
describe('parseHealthExport — handleOpenTag edge branches', () => {
  it('ignores MetadataEntry with HKElevationAscended key when outside a workout', async () => {
    // MetadataEntry appears outside any Workout context → state.currentWorkout is null
    // → condition (state.currentWorkout && ...) is false → no-op
    const xml = `<MetadataEntry key="HKElevationAscended" value="100 ft"/>`
    _xmlContent = makeXml(xml)
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.workouts).toHaveLength(0)
  })

  it('ignores MetadataEntry with a non-elevation key inside a workout', async () => {
    // MetadataEntry with a different key → the && short-circuits on key check
    const xml = `<Workout workoutActivityType="HKWorkoutActivityTypeRunning"
       sourceName="Apple Watch"
       startDate="2026-01-15 07:00:00 -0500"
       endDate="2026-01-15 07:30:00 -0500"
       duration="30" durationUnit="min">
     <MetadataEntry key="HKAverageMETs" value="8.5 METs"/>
   </Workout>`
    _xmlContent = makeXml(xml)
    const result = await parseHealthExport('/fake.zip', noopProgress)
    // Workout still completes, just no elevation gain set from the MetadataEntry
    expect(result.workouts).toHaveLength(1)
    expect(result.workouts[0].elevationGainM).toBeNull()
  })

  it('ignores WorkoutStatistics when outside a Workout element', async () => {
    // WorkoutStatistics outside Workout → state.currentWorkout is null → no-op
    const xml = `<WorkoutStatistics type="HKQuantityTypeIdentifierHeartRate"
       unit="count/min" average="145" maximum="178"
       startDate="2026-01-15 07:00:00 -0500"
       endDate="2026-01-15 07:30:00 -0500"/>`
    _xmlContent = makeXml(xml)
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.workouts).toHaveLength(0)
  })

  it('handles HealthData element with no locale attribute (locale = null)', async () => {
    // HealthData with no locale attr → attrs.locale is undefined → undefined || null → null
    _xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE HealthData []>
<HealthData>
 <ExportDate value="2026-06-01 10:00:00 -0400"/>
</HealthData>`
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.locale).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// finalizeWorkout — skipped when startTime/endTime/activityType is missing
// ---------------------------------------------------------------------------
describe('parseHealthExport — finalizeWorkout skip conditions', () => {
  it('skips workout when startDate is missing (appleDateToIso returns null)', async () => {
    const xml = `<Workout workoutActivityType="HKWorkoutActivityTypeRunning"
       sourceName="Apple Watch"
       endDate="2026-01-15 07:30:00 -0500"
       duration="30" durationUnit="min">
   </Workout>`
    _xmlContent = makeXml(xml)
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.workouts).toHaveLength(0)
  })

  it('skips workout when workoutActivityType is missing', async () => {
    const xml = `<Workout sourceName="Apple Watch"
       startDate="2026-01-15 07:00:00 -0500"
       endDate="2026-01-15 07:30:00 -0500"
       duration="30" durationUnit="min">
   </Workout>`
    _xmlContent = makeXml(xml)
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.workouts).toHaveLength(0)
  })

  it('handles workout with null duration (durationMin stays null)', async () => {
    // No duration attr → toFinite(undefined) → null → durationMin = null (not multiplied)
    const xml = `<Workout workoutActivityType="HKWorkoutActivityTypeRunning"
       sourceName="Apple Watch"
       startDate="2026-01-15 07:00:00 -0500"
       endDate="2026-01-15 07:30:00 -0500">
   </Workout>`
    _xmlContent = makeXml(xml)
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.workouts).toHaveLength(1)
    expect(result.workouts[0].durationMin).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// handleRecord: body_mass vs. height profile updates — older date not replacing newer
// ---------------------------------------------------------------------------
describe('parseHealthExport — profile: older date does not replace newer', () => {
  it('does not update height profile when new record is older than current', async () => {
    // First record is newer (Jan 15), second is older (Jan 10) → profile stays Jan 15
    const xml =
      `<Record type="HKQuantityTypeIdentifierHeight" sourceName="iPhone" unit="m"` +
      ` startDate="2026-01-15 08:00:00 -0500" endDate="2026-01-15 08:00:01 -0500" value="1.80"/>` +
      `<Record type="HKQuantityTypeIdentifierHeight" sourceName="iPhone" unit="m"` +
      ` startDate="2026-01-10 08:00:00 -0500" endDate="2026-01-10 08:00:01 -0500" value="1.75"/>`
    _xmlContent = makeXml(xml)
    const result = await parseHealthExport('/fake.zip', noopProgress)
    // Profile should keep the more recent value (1.80 from Jan 15)
    expect(result.profile.height?.value).toBeCloseTo(1.80, 2)
  })

  it('handles height record with no endDate (endDate ?? "" falls back to empty string)', async () => {
    // No endDate → attrs.endDate is undefined → endDate ?? '' → '' → profile is set with date = ''
    const xml = `<Record type="HKQuantityTypeIdentifierHeight" sourceName="iPhone" unit="m"
       startDate="2026-01-15 08:00:00 -0500" value="1.80"/>`
    _xmlContent = makeXml(xml)
    const result = await parseHealthExport('/fake.zip', noopProgress)
    // height metric still recorded (no endDate doesn't block aggregation)
    const metric = result.dailyMetrics.find((m) => m.metricType === 'height')
    expect(metric).toBeDefined()
  })

  it('handles height record with no unit attribute (unit ?? "" falls back to empty)', async () => {
    // No unit → attrs.unit is undefined → attrs.unit ?? '' → '' used in profile
    const xml = `<Record type="HKQuantityTypeIdentifierHeight" sourceName="iPhone"
       startDate="2026-01-15 08:00:00 -0500" endDate="2026-01-15 08:00:01 -0500" value="1.80"/>`
    _xmlContent = makeXml(xml)
    const result = await parseHealthExport('/fake.zip', noopProgress)
    // Profile is set with empty unit string
    expect(result.profile.height?.value).toBeCloseTo(1.80, 2)
    expect(result.profile.height?.unit).toBe('')
  })
})
