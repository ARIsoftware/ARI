/**
 * Tests for the Apple Health parser internals.
 *
 * parseHealthExport() requires zip file I/O, so we mock the zip-reader
 * module and feed XML strings directly. This lets us cover all the internal
 * parsing/aggregation paths without a real zip file.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Readable } from 'node:stream'

// ── Mock zip-reader before importing parser ──────────────────────────────────
let _xmlContent = ''
let _ecgBuffers: Buffer[] = []
let _gpxBuffers: Buffer[] = []
let _clinicalBuffers: Buffer[] = []

vi.mock('@/modules-core/health-data/lib/zip-reader', () => ({
  readZipDirectory: vi.fn(async () => ({
    entries: [
      // Main export XML
      { path: 'apple_health_export/export.xml', uncompressedSize: 100, compressionMethod: 0, localHeaderOffset: 0, compressedSize: 100 },
      // ECG CSV files
      ...(_ecgBuffers.map((_, i) => ({
        path: `apple_health_export/electrocardiograms/ecg_${i}.csv`,
        uncompressedSize: 100, compressionMethod: 0, localHeaderOffset: 0, compressedSize: 100,
      }))),
      // GPX route files
      ...(_gpxBuffers.map((_, i) => ({
        path: `apple_health_export/workout-routes/route_2026-01-0${i + 1}_7.00am.gpx`,
        uncompressedSize: 100, compressionMethod: 0, localHeaderOffset: 0, compressedSize: 100,
      }))),
      // Clinical records
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
    // Return a Readable that emits the XML content
    return Readable.from([Buffer.from(_xmlContent, 'utf8')])
  }),
  readZipEntry: vi.fn(async (_zipPath: string, entry: any, _maxBytes: number) => {
    // Match by path
    if (/electrocardiograms/.test(entry.path)) {
      const idx = parseInt(entry.path.match(/ecg_(\d+)/)?.[1] ?? '0')
      return _ecgBuffers[idx] ?? Buffer.from('')
    }
    if (/workout-routes/.test(entry.path)) {
      const idx = parseInt(entry.path.match(/route_2026-01-0(\d+)/)?.[1] ?? '1') - 1
      return _gpxBuffers[idx] ?? Buffer.from('')
    }
    if (/clinical-records/.test(entry.path)) {
      const idx = parseInt(entry.path.match(/record_(\d+)/)?.[1] ?? '0')
      return _clinicalBuffers[idx] ?? Buffer.from('')
    }
    return Buffer.from('')
  }),
}))

import { parseHealthExport } from '@/modules-core/health-data/lib/parser'

// ── Helpers ──────────────────────────────────────────────────────────────────

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

function stepRecord(date: string, value: string, source = 'iPhone'): string {
  return `<Record type="HKQuantityTypeIdentifierStepCount" sourceName="${source}" unit="count" startDate="${date} 00:00:00 -0500" endDate="${date} 23:59:59 -0500" value="${value}"/>`
}

function heartRecord(date: string, value: string, source = 'Watch'): string {
  return `<Record type="HKQuantityTypeIdentifierHeartRate" sourceName="${source}" unit="count/min" startDate="${date} 08:00:00 -0500" endDate="${date} 08:00:01 -0500" value="${value}"/>`
}

function sleepRecord(value: string, startDate: string, endDate: string, source = 'iPhone'): string {
  return `<Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="${source}" value="${value}" startDate="${startDate} -0500" endDate="${endDate} -0500"/>`
}

// ── Parse Lifecycle ──────────────────────────────────────────────────────────

beforeEach(() => {
  _xmlContent = ''
  _ecgBuffers = []
  _gpxBuffers = []
  _clinicalBuffers = []
})

describe('parseHealthExport — basic structure', () => {
  it('throws when no export XML found', async () => {
    // Override findExportXml to return null
    const { findExportXml } = await import('@/modules-core/health-data/lib/zip-reader')
    vi.mocked(findExportXml).mockReturnValueOnce(null)
    await expect(parseHealthExport('/fake/path.zip', noopProgress)).rejects.toThrow(
      /no export data XML/
    )
  })

  it('parses exportDate and locale from HealthData/ExportDate', async () => {
    _xmlContent = makeXml('')
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.locale).toBe('en_US')
    expect(result.exportDate).toBe('2026-06-01T10:00:00-04:00')
  })

  it('parses profile from Me element', async () => {
    _xmlContent = makeXml('')
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.profile.dateOfBirth).toBe('1990-05-15')
    expect(result.profile.biologicalSex).toBe('Male')
    expect(result.profile.bloodType).toBe('A+')
  })

  it('returns empty arrays when no records', async () => {
    _xmlContent = makeXml('')
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.dailyMetrics).toEqual([])
    expect(result.workouts).toEqual([])
    expect(result.activityDays).toEqual([])
    expect(result.sleepNights).toEqual([])
    expect(result.ecgs).toEqual([])
    expect(result.routes).toEqual([])
    expect(result.clinical).toEqual([])
    expect(result.recordsParsed).toBe(0)
  })
})

describe('parseHealthExport — daily metrics', () => {
  it('parses a step count record into a daily metric', async () => {
    _xmlContent = makeXml(stepRecord('2026-01-15', '8432'))
    const result = await parseHealthExport('/fake.zip', noopProgress)
    const metric = result.dailyMetrics.find((m) => m.metricType === 'step_count')
    expect(metric).toBeDefined()
    expect(metric?.metricDate).toBe('2026-01-15')
    expect(metric?.valueSum).toBe(8432)
    expect(metric?.sampleCount).toBe(1)
  })

  it('sums multiple records from the same source on the same day', async () => {
    _xmlContent = makeXml(
      stepRecord('2026-01-15', '5000') + '\n' + stepRecord('2026-01-15', '3432')
    )
    const result = await parseHealthExport('/fake.zip', noopProgress)
    const metric = result.dailyMetrics.find((m) => m.metricType === 'step_count')
    expect(metric?.valueSum).toBe(8432)
    expect(metric?.sampleCount).toBe(2)
  })

  it('takes the max-source for cumulative metrics (deduplication)', async () => {
    // Two sources: iPhone=10000, Watch=8000 — cumulative takes the highest
    _xmlContent = makeXml(
      stepRecord('2026-01-15', '10000', 'iPhone') + '\n' +
      stepRecord('2026-01-15', '8000', 'Apple Watch')
    )
    const result = await parseHealthExport('/fake.zip', noopProgress)
    const metric = result.dailyMetrics.find((m) => m.metricType === 'step_count')
    expect(metric?.valueSum).toBe(10000)
  })

  it('merges multiple sources for avg-mode metrics', async () => {
    _xmlContent = makeXml(
      heartRecord('2026-01-15', '72', 'iPhone') + '\n' +
      heartRecord('2026-01-15', '78', 'Apple Watch')
    )
    const result = await parseHealthExport('/fake.zip', noopProgress)
    const metric = result.dailyMetrics.find((m) => m.metricType === 'heart_rate')
    expect(metric?.sampleCount).toBe(2)
    expect(metric?.valueAvg).toBe(75)
  })

  it('computes min, max, avg correctly for a single source', async () => {
    _xmlContent = makeXml(
      `<Record type="HKQuantityTypeIdentifierHeartRate" sourceName="Watch" unit="count/min" startDate="2026-01-15 08:00:00 -0500" endDate="2026-01-15 08:00:01 -0500" value="60"/>` +
      `<Record type="HKQuantityTypeIdentifierHeartRate" sourceName="Watch" unit="count/min" startDate="2026-01-15 09:00:00 -0500" endDate="2026-01-15 09:00:01 -0500" value="90"/>` +
      `<Record type="HKQuantityTypeIdentifierHeartRate" sourceName="Watch" unit="count/min" startDate="2026-01-15 10:00:00 -0500" endDate="2026-01-15 10:00:01 -0500" value="75"/>`
    )
    const result = await parseHealthExport('/fake.zip', noopProgress)
    const metric = result.dailyMetrics.find((m) => m.metricType === 'heart_rate')
    expect(metric?.valueMin).toBe(60)
    expect(metric?.valueMax).toBe(90)
    expect(metric?.valueAvg).toBe(75)
    expect(metric?.sampleCount).toBe(3)
  })

  it('skips records with invalid date keys', async () => {
    _xmlContent = makeXml(
      `<Record type="HKQuantityTypeIdentifierStepCount" sourceName="iPhone" unit="count" startDate="invalid-date 00:00:00 -0500" endDate="2026-13-99 23:59:59 -0500" value="1000"/>`
    )
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.dailyMetrics).toHaveLength(0)
  })

  it('skips records with non-finite values', async () => {
    _xmlContent = makeXml(
      `<Record type="HKQuantityTypeIdentifierStepCount" sourceName="iPhone" unit="count" startDate="2026-01-15 00:00:00 -0500" endDate="2026-01-15 23:59:59 -0500" value="NaN"/>`
    )
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.dailyMetrics).toHaveLength(0)
  })

  it('converts units when mixing lb and kg for body_mass', async () => {
    // First record sets the unit to kg
    _xmlContent = makeXml(
      `<Record type="HKQuantityTypeIdentifierBodyMass" sourceName="Scale" unit="kg" startDate="2026-01-15 09:00:00 -0500" endDate="2026-01-15 09:00:01 -0500" value="80"/>` +
      `<Record type="HKQuantityTypeIdentifierBodyMass" sourceName="iPhone" unit="lb" startDate="2026-01-15 10:00:00 -0500" endDate="2026-01-15 10:00:01 -0500" value="176.37"/>`
    )
    const result = await parseHealthExport('/fake.zip', noopProgress)
    const metric = result.dailyMetrics.find((m) => m.metricType === 'body_mass')
    // Both should have been accepted (lb converted to kg ≈ 80)
    expect(metric?.sampleCount).toBe(2)
    expect(metric?.valueAvg).toBeCloseTo(80, 0)
  })

  it('tracks height and bodyMass profile from latest sample', async () => {
    _xmlContent = makeXml(
      `<Record type="HKQuantityTypeIdentifierHeight" sourceName="iPhone" unit="m" startDate="2026-01-15 09:00:00 -0500" endDate="2026-01-15 09:00:01 -0500" value="1.80"/>` +
      `<Record type="HKQuantityTypeIdentifierBodyMass" sourceName="Scale" unit="kg" startDate="2026-01-15 09:00:00 -0500" endDate="2026-01-15 09:00:01 -0500" value="80"/>`
    )
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.profile.height?.value).toBe(1.80)
    expect(result.profile.height?.unit).toBe('m')
    expect(result.profile.bodyMass?.value).toBe(80)
  })

  it('does not count records nested inside Correlation twice', async () => {
    _xmlContent = makeXml(
      `<Correlation type="HKCorrelationTypeIdentifierBloodPressure">
         <Record type="HKQuantityTypeIdentifierStepCount" sourceName="iPhone" unit="count" startDate="2026-01-15 00:00:00 -0500" endDate="2026-01-15 23:59:59 -0500" value="1000"/>
       </Correlation>`
    )
    const result = await parseHealthExport('/fake.zip', noopProgress)
    // Record is inside a Correlation — should be skipped for metric aggregation
    expect(result.dailyMetrics).toHaveLength(0)
    // But recordsParsed still counts: Correlation=1, Record=1
    expect(result.recordsParsed).toBeGreaterThan(0)
  })
})

describe('parseHealthExport — workouts', () => {
  const WORKOUT_XML = `<Workout workoutActivityType="HKWorkoutActivityTypeRunning"
     sourceName="Apple Watch"
     startDate="2026-01-15 07:00:00 -0500"
     endDate="2026-01-15 07:30:00 -0500"
     duration="30" durationUnit="min"
     totalDistance="5.1" totalDistanceUnit="km"
     totalEnergyBurned="300" totalEnergyBurnedUnit="Cal">
   <WorkoutStatistics type="HKQuantityTypeIdentifierHeartRate" average="142" maximum="170"/>
   <WorkoutStatistics type="HKQuantityTypeIdentifierDistanceWalkingRunning" sum="5.0" unit="km"/>
   <WorkoutStatistics type="HKQuantityTypeIdentifierActiveEnergyBurned" sum="295" unit="Cal"/>
   <MetadataEntry key="HKElevationAscended" value="50 m"/>
 </Workout>`

  it('parses a workout correctly', async () => {
    _xmlContent = makeXml(WORKOUT_XML)
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.workouts).toHaveLength(1)
    const w = result.workouts[0]
    expect(w.activityType).toBe('Running')
    expect(w.startTime).toBe('2026-01-15T07:00:00-05:00')
    expect(w.endTime).toBe('2026-01-15T07:30:00-05:00')
    expect(w.durationMin).toBe(30)
    expect(w.distanceKm).toBeCloseTo(5.1, 1)
    expect(w.energyKcal).toBeCloseTo(300, 0)
    expect(w.avgHeartRate).toBe(142)
    expect(w.maxHeartRate).toBe(170)
    expect(w.elevationGainM).toBeCloseTo(50, 0)
    expect(w.sourceName).toBe('Apple Watch')
  })

  it('falls back to WorkoutStatistics distance when totalDistance is 0', async () => {
    const xml = `<Workout workoutActivityType="HKWorkoutActivityTypeRunning"
       sourceName="Apple Watch"
       startDate="2026-01-15 07:00:00 -0500"
       endDate="2026-01-15 07:30:00 -0500"
       duration="30" durationUnit="min"
       totalDistance="0" totalDistanceUnit="km"
       totalEnergyBurned="0" totalEnergyBurnedUnit="Cal">
     <WorkoutStatistics type="HKQuantityTypeIdentifierDistanceWalkingRunning" sum="5.0" unit="km"/>
     <WorkoutStatistics type="HKQuantityTypeIdentifierActiveEnergyBurned" sum="295" unit="Cal"/>
   </Workout>`
    _xmlContent = makeXml(xml)
    const result = await parseHealthExport('/fake.zip', noopProgress)
    const w = result.workouts[0]
    expect(w.distanceKm).toBeCloseTo(5.0, 1)
    expect(w.energyKcal).toBeCloseTo(295, 0)
  })

  it('converts duration in seconds to minutes', async () => {
    const xml = `<Workout workoutActivityType="HKWorkoutActivityTypeYoga"
       sourceName="Apple Watch"
       startDate="2026-01-15 07:00:00 -0500"
       endDate="2026-01-15 07:30:00 -0500"
       duration="1800" durationUnit="s">
   </Workout>`
    _xmlContent = makeXml(xml)
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.workouts[0].durationMin).toBeCloseTo(30, 1)
  })

  it('converts duration in hours to minutes', async () => {
    const xml = `<Workout workoutActivityType="HKWorkoutActivityTypeCycling"
       sourceName="Apple Watch"
       startDate="2026-01-15 07:00:00 -0500"
       endDate="2026-01-15 09:00:00 -0500"
       duration="2" durationUnit="hr">
   </Workout>`
    _xmlContent = makeXml(xml)
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.workouts[0].durationMin).toBeCloseTo(120, 0)
  })

  it('handles distance unit mi conversion', async () => {
    const xml = `<Workout workoutActivityType="HKWorkoutActivityTypeRunning"
       sourceName="Apple Watch"
       startDate="2026-01-15 07:00:00 -0500"
       endDate="2026-01-15 07:30:00 -0500"
       duration="30" durationUnit="min"
       totalDistance="3.1" totalDistanceUnit="mi">
   </Workout>`
    _xmlContent = makeXml(xml)
    const result = await parseHealthExport('/fake.zip', noopProgress)
    // 3.1 mi * 1.609344 ≈ 4.99 km
    expect(result.workouts[0].distanceKm).toBeCloseTo(4.99, 1)
  })

  it('handles energy unit kJ conversion', async () => {
    const xml = `<Workout workoutActivityType="HKWorkoutActivityTypeRunning"
       sourceName="Apple Watch"
       startDate="2026-01-15 07:00:00 -0500"
       endDate="2026-01-15 07:30:00 -0500"
       duration="30" durationUnit="min"
       totalEnergyBurned="1255.2" totalEnergyBurnedUnit="kJ">
   </Workout>`
    _xmlContent = makeXml(xml)
    const result = await parseHealthExport('/fake.zip', noopProgress)
    // 1255.2 kJ / 4.184 ≈ 300 kcal
    expect(result.workouts[0].energyKcal).toBeCloseTo(300, 0)
  })

  it('skips workout when startDate or endDate is missing/invalid', async () => {
    const xml = `<Workout workoutActivityType="HKWorkoutActivityTypeRunning"
       sourceName="Apple Watch"
       startDate="bad-date"
       endDate="also-bad">
   </Workout>`
    _xmlContent = makeXml(xml)
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.workouts).toHaveLength(0)
  })

  it('parses WorkoutStatistics for cycling distance', async () => {
    const xml = `<Workout workoutActivityType="HKWorkoutActivityTypeCycling"
       sourceName="Apple Watch"
       startDate="2026-01-15 07:00:00 -0500"
       endDate="2026-01-15 08:00:00 -0500"
       duration="60" durationUnit="min">
     <WorkoutStatistics type="HKQuantityTypeIdentifierDistanceCycling" sum="20.0" unit="km"/>
   </Workout>`
    _xmlContent = makeXml(xml)
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.workouts[0].distanceKm).toBeCloseTo(20.0, 1)
  })

  it('parses WorkoutStatistics for swimming distance', async () => {
    const xml = `<Workout workoutActivityType="HKWorkoutActivityTypeSwimming"
       sourceName="Apple Watch"
       startDate="2026-01-15 07:00:00 -0500"
       endDate="2026-01-15 07:30:00 -0500"
       duration="30" durationUnit="min">
     <WorkoutStatistics type="HKQuantityTypeIdentifierDistanceSwimming" sum="1.5" unit="km"/>
   </Workout>`
    _xmlContent = makeXml(xml)
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.workouts[0].distanceKm).toBeCloseTo(1.5, 1)
  })
})

describe('parseHealthExport — activity summaries', () => {
  const ACTIVITY_XML = `<ActivitySummary
     dateComponents="2026-01-15"
     activeEnergyBurned="450.3" activeEnergyBurnedGoal="600"
     appleExerciseTime="45" appleExerciseTimeGoal="30"
     appleStandHours="11" appleStandHoursGoal="12"/>`

  it('parses an activity summary', async () => {
    _xmlContent = makeXml(ACTIVITY_XML)
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.activityDays).toHaveLength(1)
    const day = result.activityDays[0]
    expect(day.day).toBe('2026-01-15')
    expect(day.activeEnergy).toBeCloseTo(450.3, 1)
    expect(day.activeEnergyGoal).toBe(600)
    expect(day.exerciseMinutes).toBe(45)
    expect(day.exerciseGoal).toBe(30)
    expect(day.standHours).toBe(11)
    expect(day.standGoal).toBe(12)
  })

  it('skips activity summary with invalid date', async () => {
    const xml = `<ActivitySummary dateComponents="2026-13-99" activeEnergyBurned="400"/>`
    _xmlContent = makeXml(xml)
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.activityDays).toHaveLength(0)
  })
})

describe('parseHealthExport — sleep analysis', () => {
  function makeSleepXml(stage: string, start: string, end: string): string {
    return `<Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="iPhone" value="${stage}" startDate="${start}" endDate="${end}"/>`
  }

  it('parses sleep records into a sleep night', async () => {
    const bodyXml =
      makeSleepXml('HKCategoryValueSleepAnalysisInBed', '2026-01-15 22:30:00 -0500', '2026-01-16 06:30:00 -0500') +
      makeSleepXml('HKCategoryValueSleepAnalysisAsleepCore', '2026-01-15 23:00:00 -0500', '2026-01-16 03:00:00 -0500') +
      makeSleepXml('HKCategoryValueSleepAnalysisAsleepDeep', '2026-01-16 00:00:00 -0500', '2026-01-16 01:00:00 -0500') +
      makeSleepXml('HKCategoryValueSleepAnalysisAsleepREM', '2026-01-16 04:00:00 -0500', '2026-01-16 05:30:00 -0500') +
      makeSleepXml('HKCategoryValueSleepAnalysisAwake', '2026-01-16 03:00:00 -0500', '2026-01-16 03:30:00 -0500')
    _xmlContent = makeXml(bodyXml)
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.sleepNights).toHaveLength(1)
    const night = result.sleepNights[0]
    expect(night.inBedMin).toBeCloseTo(480, 0)   // 8h
    expect(night.coreMin).toBeGreaterThan(0)
    expect(night.deepMin).toBeGreaterThan(0)
    expect(night.remMin).toBeGreaterThan(0)
    expect(night.awakeMin).toBeGreaterThan(0)
  })

  it('skips sleep records with unknown stage value', async () => {
    const xml = `<Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="iPhone" value="HKCategoryValueUnknown" startDate="2026-01-15 22:00:00 -0500" endDate="2026-01-16 06:00:00 -0500"/>`
    _xmlContent = makeXml(xml)
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.sleepNights).toHaveLength(0)
  })

  it('skips sleep records where endMs <= startMs', async () => {
    const xml = `<Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="iPhone" value="HKCategoryValueSleepAnalysisInBed" startDate="2026-01-15 06:00:00 -0500" endDate="2026-01-15 06:00:00 -0500"/>`
    _xmlContent = makeXml(xml)
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.sleepNights).toHaveLength(0)
  })

  it('handles HKCategoryValueSleepAnalysisAsleep (legacy unspecified)', async () => {
    const xml = makeSleepXml('HKCategoryValueSleepAnalysisAsleep', '2026-01-15 23:00:00 -0500', '2026-01-16 06:00:00 -0500')
    _xmlContent = makeXml(xml)
    const result = await parseHealthExport('/fake.zip', noopProgress)
    // Should parse as 'unspecified' stage
    expect(result.sleepNights.length).toBeGreaterThan(0)
  })

  it('splits sessions separated by > 6h gap', async () => {
    // Night 1: Jan 15/16
    const night1 = makeSleepXml('HKCategoryValueSleepAnalysisAsleepCore', '2026-01-15 23:00:00 -0500', '2026-01-16 07:00:00 -0500')
    // Night 2: Jan 16/17 (14h after night 1 ends — new session)
    const night2 = makeSleepXml('HKCategoryValueSleepAnalysisAsleepCore', '2026-01-16 23:00:00 -0500', '2026-01-17 07:00:00 -0500')
    _xmlContent = makeXml(night1 + night2)
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.sleepNights).toHaveLength(2)
  })

  it('filters out very short sleep sessions (< 15 min)', async () => {
    const xml = makeSleepXml('HKCategoryValueSleepAnalysisAsleepCore', '2026-01-15 23:00:00 -0500', '2026-01-15 23:10:00 -0500')
    _xmlContent = makeXml(xml)
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.sleepNights).toHaveLength(0)
  })
})

describe('parseHealthExport — profile blood types and sex', () => {
  const BLOOD_TYPES = [
    ['HKBloodTypeAPositive', 'A+'],
    ['HKBloodTypeANegative', 'A-'],
    ['HKBloodTypeBPositive', 'B+'],
    ['HKBloodTypeBNegative', 'B-'],
    ['HKBloodTypeABPositive', 'AB+'],
    ['HKBloodTypeABNegative', 'AB-'],
    ['HKBloodTypeOPositive', 'O+'],
    ['HKBloodTypeONegative', 'O-'],
  ]

  for (const [hkType, label] of BLOOD_TYPES) {
    it(`maps ${hkType} to ${label}`, async () => {
      _xmlContent = `<?xml version="1.0" encoding="UTF-8"?><HealthData locale="en_US">
       <ExportDate value="2026-06-01 10:00:00 -0400"/>
       <Me HKCharacteristicTypeIdentifierBloodType="${hkType}"/>
     </HealthData>`
      const result = await parseHealthExport('/fake.zip', noopProgress)
      expect(result.profile.bloodType).toBe(label)
    })
  }

  it('maps HKBiologicalSexFemale to Female', async () => {
    _xmlContent = `<?xml version="1.0" encoding="UTF-8"?><HealthData locale="en_US">
     <ExportDate value="2026-06-01 10:00:00 -0400"/>
     <Me HKCharacteristicTypeIdentifierBiologicalSex="HKBiologicalSexFemale"/>
   </HealthData>`
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.profile.biologicalSex).toBe('Female')
  })

  it('maps HKBiologicalSexOther to Other', async () => {
    _xmlContent = `<?xml version="1.0" encoding="UTF-8"?><HealthData locale="en_US">
     <ExportDate value="2026-06-01 10:00:00 -0400"/>
     <Me HKCharacteristicTypeIdentifierBiologicalSex="HKBiologicalSexOther"/>
   </HealthData>`
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.profile.biologicalSex).toBe('Other')
  })

  it('sets null for unknown blood type', async () => {
    _xmlContent = `<?xml version="1.0" encoding="UTF-8"?><HealthData locale="en_US">
     <ExportDate value="2026-06-01 10:00:00 -0400"/>
     <Me HKCharacteristicTypeIdentifierBloodType="HKBloodTypeUnknown"/>
   </HealthData>`
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.profile.bloodType).toBeNull()
  })
})

describe('parseHealthExport — ECG parsing', () => {
  const ECG_CSV = `Name,Value
Recorded Date,2024-01-15 09:41:00 -0500
Classification,Sinus Rhythm
Symptoms,None
Device,"Apple Watch, 6"
Sample Rate,512 Hz
Average Heart Rate,72 BPM
Unit,µV
100
-200
50
150
-100
`

  it('parses an ECG CSV file', async () => {
    _ecgBuffers = [Buffer.from(ECG_CSV, 'utf8')]
    _xmlContent = makeXml('')
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.ecgs).toHaveLength(1)
    const ecg = result.ecgs[0]
    expect(ecg.classification).toBe('Sinus Rhythm')
    expect(ecg.symptoms).toBe('None')
    expect(ecg.samplingFrequencyHz).toBe(512)
    expect(ecg.averageHeartRate).toBe(72)
    expect(ecg.sampleCount).toBe(5)
    expect(ecg.waveform).toHaveLength(5)
  })

  it('returns null (skips) for ECG file with no samples', async () => {
    const emptyCsv = `Name,Value\nRecorded Date,2024-01-15 09:41:00 -0500\n`
    _ecgBuffers = [Buffer.from(emptyCsv, 'utf8')]
    _xmlContent = makeXml('')
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.ecgs).toHaveLength(0)
  })

  it('handles comma-decimal locale format in ECG samples', async () => {
    const csv = `Name,Value\n-24,8\n50,1\n`
    _ecgBuffers = [Buffer.from(csv, 'utf8')]
    _xmlContent = makeXml('')
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.ecgs).toHaveLength(1)
    expect(result.ecgs[0].sampleCount).toBe(2)
    // Values should be parsed as -24.8 and 50.1
    expect(result.ecgs[0].waveform[0]).toBeCloseTo(-24.8, 0)
  })

  it('downsamples ECG waveform when more than 1200 samples', async () => {
    // Generate 2400 samples
    const samples = Array.from({ length: 2400 }, (_, i) => String(i)).join('\n')
    const csv = `Name,Value\n${samples}\n`
    _ecgBuffers = [Buffer.from(csv, 'utf8')]
    _xmlContent = makeXml('')
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.ecgs).toHaveLength(1)
    expect(result.ecgs[0].waveform.length).toBe(1200)
    expect(result.ecgs[0].waveformFull.length).toBe(2400)
    expect(result.ecgs[0].durationSec).toBeNull() // no sample rate in CSV
  })

  it('uses fallback date from first date-like value in ECG headers', async () => {
    // No 'recorded' key, but has a date-like value
    const csv = `Aufnahmedatum,2024-03-10 14:00:00 -0500\n100\n200\n`
    _ecgBuffers = [Buffer.from(csv, 'utf8')]
    _xmlContent = makeXml('')
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.ecgs).toHaveLength(1)
    // recordedAt should be set from fallback
    expect(result.ecgs[0].recordedAt).toBeTruthy()
  })

  it('computes durationSec when sample rate is known', async () => {
    const samples = Array.from({ length: 512 }, () => '100').join('\n')
    const csv = `Name,Value\nSample Rate,512 Hz\nRecorded Date,2024-01-15 09:41:00 -0500\n${samples}\n`
    _ecgBuffers = [Buffer.from(csv, 'utf8')]
    _xmlContent = makeXml('')
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.ecgs[0].durationSec).toBeCloseTo(1, 2) // 512 samples / 512 Hz = 1s
  })
})

describe('parseHealthExport — GPX route parsing', () => {
  function makeGpx(points: Array<[number, number, string]>): string {
    const trackPoints = points
      .map(([lat, lon, time]) => `<trkpt lat="${lat}" lon="${lon}"><time>${time}</time></trkpt>`)
      .join('\n')
    return `<?xml version="1.0"?><gpx><trk><trkseg>${trackPoints}</trkseg></trk></gpx>`
  }

  it('parses a GPX route with multiple points', async () => {
    const gpx = makeGpx([
      [37.7749, -122.4194, '2026-01-01T07:00:00Z'],
      [37.7750, -122.4195, '2026-01-01T07:15:00Z'],
      [37.7760, -122.4200, '2026-01-01T07:30:00Z'],
    ])
    _gpxBuffers = [Buffer.from(gpx, 'utf8')]
    _xmlContent = makeXml('')
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.routes).toHaveLength(1)
    const route = result.routes[0]
    // Date comes from filename: route_2026-01-01_7.00am.gpx
    expect(route.routeDate).toBe('2026-01-01')
    expect(route.pointCount).toBe(3)
    expect(route.distanceKm).toBeGreaterThan(0)
    expect(route.durationMin).toBeCloseTo(30, 1)
    expect(route.startedAt).toBe('2026-01-01T07:00:00Z')
    expect(route.points.length).toBeGreaterThan(0)
  })

  it('returns null for GPX with fewer than 2 points', async () => {
    const gpx = `<?xml version="1.0"?><gpx><trk><trkseg><trkpt lat="37.77" lon="-122.42"><time>2026-01-01T07:00:00Z</time></trkpt></trkseg></trk></gpx>`
    _gpxBuffers = [Buffer.from(gpx, 'utf8')]
    _xmlContent = makeXml('')
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.routes).toHaveLength(0)
  })

  it('downsamples route when more than 250 points', async () => {
    const points: Array<[number, number, string]> = Array.from(
      { length: 500 },
      (_, i) => [37.77 + i * 0.001, -122.42, `2026-01-01T${String(7 + Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00Z`]
    )
    const gpx = makeGpx(points)
    _gpxBuffers = [Buffer.from(gpx, 'utf8')]
    _xmlContent = makeXml('')
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.routes).toHaveLength(1)
    // Points should be downsampled (roughly 250, +1 for the last point)
    expect(result.routes[0].points.length).toBeLessThanOrEqual(252)
  })
})

describe('parseHealthExport — clinical record parsing', () => {
  const IMMUNIZATION_JSON = JSON.stringify({
    resourceType: 'Immunization',
    status: 'completed',
    vaccineCode: {
      coding: [
        { system: 'http://hl7.org/fhir/sid/cvx', code: '207', display: 'COVID-19 Vaccine (Moderna)' },
      ],
      text: 'COVID-19, mRNA, LNP-S, PF, 100 mcg/ 0.5 mL dose',
    },
    occurrenceDateTime: '2021-01-15',
    lotNumber: 'AB1234',
    performer: [{ actor: { display: 'General Hospital' } }],
  })

  it('parses an immunization clinical record', async () => {
    _clinicalBuffers = [Buffer.from(IMMUNIZATION_JSON, 'utf8')]
    _xmlContent = makeXml('')
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.clinical).toHaveLength(1)
    const rec = result.clinical[0]
    expect(rec.type).toBe('Immunization')
    expect(rec.status).toBe('completed')
    expect(rec.date).toBe('2021-01-15')
    expect(rec.lot).toBe('AB1234')
    expect(rec.location).toBe('General Hospital')
    expect(rec.cvx).toBe('207')
  })

  it('skips invalid JSON clinical records', async () => {
    _clinicalBuffers = [Buffer.from('not-valid-json', 'utf8')]
    _xmlContent = makeXml('')
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.clinical).toHaveLength(0)
  })

  it('skips clinical records without resourceType', async () => {
    _clinicalBuffers = [Buffer.from(JSON.stringify({ id: '123' }), 'utf8')]
    _xmlContent = makeXml('')
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.clinical).toHaveLength(0)
  })

  it('handles clinical record with unknown CVX code', async () => {
    const json = JSON.stringify({
      resourceType: 'Immunization',
      status: 'completed',
      vaccineCode: {
        coding: [{ system: 'http://hl7.org/fhir/sid/cvx', code: '999' }],
      },
      occurrenceDateTime: '2021-01-15',
    })
    _clinicalBuffers = [Buffer.from(json, 'utf8')]
    _xmlContent = makeXml('')
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.clinical[0].name).toContain('CVX 999')
  })

  it('handles clinical record using effectiveDateTime', async () => {
    const json = JSON.stringify({
      resourceType: 'Observation',
      status: 'final',
      code: { text: 'Blood pressure' },
      effectiveDateTime: '2022-06-10T14:30:00Z',
    })
    _clinicalBuffers = [Buffer.from(json, 'utf8')]
    _xmlContent = makeXml('')
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.clinical[0].date).toBe('2022-06-10')
  })

  it('falls back to resourceType as name when no code', async () => {
    const json = JSON.stringify({
      resourceType: 'AllergyIntolerance',
      status: 'active',
      date: '2020-01-01',
    })
    _clinicalBuffers = [Buffer.from(json, 'utf8')]
    _xmlContent = makeXml('')
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.clinical[0].name).toBe('AllergyIntolerance')
    expect(result.clinical[0].type).toBe('AllergyIntolerance')
  })

  it('truncates clinical record name to 300 chars', async () => {
    const longName = 'A'.repeat(400)
    const json = JSON.stringify({
      resourceType: 'Observation',
      status: 'final',
      code: { text: longName },
    })
    _clinicalBuffers = [Buffer.from(json, 'utf8')]
    _xmlContent = makeXml('')
    const result = await parseHealthExport('/fake.zip', noopProgress)
    expect(result.clinical[0].name.length).toBe(300)
  })
})

describe('parseHealthExport — unit conversion edge cases', () => {
  it('skips samples with inconvertible units and emits console.warn', async () => {
    // Mix step_count in "count" (first) with "%" (incompatible) for second source
    _xmlContent = makeXml(
      `<Record type="HKQuantityTypeIdentifierStepCount" sourceName="iPhone" unit="count" startDate="2026-01-15 00:00:00 -0500" endDate="2026-01-15 23:59:59 -0500" value="1000"/>` +
      `<Record type="HKQuantityTypeIdentifierStepCount" sourceName="Watch" unit="%" startDate="2026-01-15 00:00:00 -0500" endDate="2026-01-15 23:59:59 -0500" value="50"/>`
    )
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await parseHealthExport('/fake.zip', noopProgress)
    // Second sample should be skipped — only iPhone sample counts
    const metric = result.dailyMetrics.find((m) => m.metricType === 'step_count')
    expect(metric?.sampleCount).toBe(1)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('step_count'))
    warnSpy.mockRestore()
  })

  it('converts temperature degF to degC', async () => {
    // First record sets unit to degC
    _xmlContent = makeXml(
      `<Record type="HKQuantityTypeIdentifierAppleSleepingWristTemperature" sourceName="Watch" unit="degC" startDate="2026-01-15 00:00:00 -0500" endDate="2026-01-15 00:00:01 -0500" value="36"/>` +
      `<Record type="HKQuantityTypeIdentifierAppleSleepingWristTemperature" sourceName="iPhone" unit="degF" startDate="2026-01-15 01:00:00 -0500" endDate="2026-01-15 01:00:01 -0500" value="98.6"/>`
    )
    const result = await parseHealthExport('/fake.zip', noopProgress)
    const metric = result.dailyMetrics.find((m) => m.metricType === 'apple_sleeping_wrist_temperature')
    // 98.6°F = 37°C; average of 36 and 37 = 36.5
    expect(metric?.sampleCount).toBe(2)
    expect(metric?.valueAvg).toBeCloseTo(36.5, 0)
  })
})
