/**
 * Apple Health export parser.
 *
 * Streams `apple_health_export/export.xml` out of the uploaded zip and
 * aggregates its ~millions of raw records into daily per-metric summaries,
 * workouts, activity-ring days, and nightly sleep sessions. Also parses
 * ECG CSV files (downsampled waveforms) and FHIR clinical-record JSONs.
 * The 300MB+ `export_cda.xml` duplicate and GPX route files are skipped.
 *
 * Nothing here touches the database — persistence lives in import-job.ts.
 */

import { StringDecoder } from 'string_decoder'
import { readZipDirectory, openZipEntryStream, readZipEntry, findExportXml, type ZipEntry } from './zip-reader'
import { StreamingXmlParser, type XmlAttributes } from './xml-stream'
import { normalizeMetricType, isCumulative } from './metrics'

const MAX_ECG_FILE_BYTES = 5 * 1024 * 1024
const MAX_CLINICAL_FILE_BYTES = 1 * 1024 * 1024
const MAX_GPX_FILE_BYTES = 25 * 1024 * 1024
const MAX_ECG_FILES = 200
const MAX_CLINICAL_FILES = 500
const MAX_GPX_FILES = 500
const ECG_WAVEFORM_POINTS = 1200
/** Full ECG strips are ~15,360 samples (30s @ 512Hz); cap for safety */
const MAX_ECG_FULL_SAMPLES = 20000
/** Route paths are downsampled to this many coordinate pairs */
const ROUTE_MAX_POINTS = 250
/** Gap (ms) between sleep records that starts a new sleep session */
const SLEEP_SESSION_GAP_MS = 6 * 60 * 60 * 1000
/** Ignore sleep sessions shorter than this (noise, e.g. brief sensor blips) */
const MIN_SLEEP_SESSION_MIN = 15
/** Tolerated overshoot past an entry's declared uncompressed size */
const MAX_DECLARED_SIZE_OVERSHOOT_BYTES = 1024 * 1024
/** Absolute ceiling on decompressed export.xml, whatever the zip declares */
const MAX_EXPORT_XML_BYTES = 64 * 1024 * 1024 * 1024
/** Hard ceilings so a hostile export can't exhaust memory */
const MAX_SLEEP_RECORDS = 2_000_000
const MAX_WORKOUTS = 200_000
const MAX_ACTIVITY_DAYS = 40_000
/** Total (type, date, source) aggregate leaves across all metrics */
const MAX_AGG_ENTRIES = 5_000_000
/** Strict YYYY-MM-DD — garbage like 2023-13-45 would fail the DATE column insert */
const DATE_KEY_REGEX = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

export interface ParsedDailyMetric {
  metricType: string
  metricDate: string
  unit: string | null
  valueSum: number | null
  valueMin: number | null
  valueMax: number | null
  valueAvg: number | null
  sampleCount: number
}

export interface ParsedWorkout {
  activityType: string
  startTime: string
  endTime: string
  durationMin: number | null
  distanceKm: number | null
  energyKcal: number | null
  avgHeartRate: number | null
  maxHeartRate: number | null
  elevationGainM: number | null
  sourceName: string | null
}

export interface ParsedActivityDay {
  day: string
  activeEnergy: number | null
  activeEnergyGoal: number | null
  exerciseMinutes: number | null
  exerciseGoal: number | null
  standHours: number | null
  standGoal: number | null
}

export interface ParsedSleepNight {
  nightDate: string
  startTime: string | null
  endTime: string | null
  inBedMin: number | null
  asleepMin: number | null
  coreMin: number | null
  deepMin: number | null
  remMin: number | null
  awakeMin: number | null
}

export interface ParsedEcg {
  recordedAt: string | null
  classification: string | null
  symptoms: string | null
  averageHeartRate: number | null
  samplingFrequencyHz: number | null
  sampleCount: number | null
  durationSec: number | null
  device: string | null
  /** Downsampled preview (≤ ECG_WAVEFORM_POINTS points) */
  waveform: number[]
  /** Full-resolution strip (capped at MAX_ECG_FULL_SAMPLES) */
  waveformFull: number[]
}

export interface ParsedClinicalRecord {
  type: string
  name: string
  date: string | null
  status: string | null
  cvx: string | null
  lot: string | null
  location: string | null
}

export interface ParsedRoute {
  routeDate: string
  startedAt: string | null
  distanceKm: number | null
  durationMin: number | null
  pointCount: number
  /** Downsampled [lat, lon] pairs */
  points: Array<[number, number]>
}

export interface HealthProfile {
  dateOfBirth: string | null
  biologicalSex: string | null
  bloodType: string | null
  height: { value: number; unit: string; date: string } | null
  bodyMass: { value: number; unit: string; date: string } | null
}

export interface ParsedHealthData {
  exportDate: string | null
  locale: string | null
  profile: HealthProfile
  clinical: ParsedClinicalRecord[]
  dailyMetrics: ParsedDailyMetric[]
  workouts: ParsedWorkout[]
  activityDays: ParsedActivityDay[]
  sleepNights: ParsedSleepNight[]
  ecgs: ParsedEcg[]
  routes: ParsedRoute[]
  recordsParsed: number
}

export interface ParseProgress {
  percent: number
  phase: string
  recordsParsed: number
}

export type ProgressCallback = (progress: ParseProgress) => Promise<void>

/** Convert "2023-12-25 16:21:57 -0400" to "2023-12-25T16:21:57-04:00" */
function appleDateToIso(value: string | undefined): string | null {
  if (!value) return null
  const match = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-])(\d{2})(\d{2})$/.exec(value)
  if (!match) return null
  return `${match[1]}T${match[2]}${match[3]}${match[4]}:${match[5]}`
}

function toFinite(value: string | undefined): number | null {
  if (value === undefined || value === '') return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

function distanceToKm(value: number, unit: string | undefined): number {
  switch (unit) {
    case 'mi': return value * 1.609344
    case 'm': return value / 1000
    case 'yd': return value * 0.0009144
    default: return value
  }
}

function energyToKcal(value: number, unit: string | undefined): number {
  switch (unit) {
    case 'kJ': return value / 4.184
    case 'J': return value / 4184
    default: return value // Cal / kcal
  }
}

function lengthToMeters(value: number, unit: string): number {
  switch (unit) {
    case 'cm': return value / 100
    case 'ft': return value * 0.3048
    case 'in': return value * 0.0254
    case 'km': return value * 1000
    default: return value
  }
}

/** Per-dimension factors to a base unit (kg, km, kcal, min, mL) */
const UNIT_DIMENSIONS: Array<Record<string, number>> = [
  { kg: 1, lb: 0.45359237, g: 0.001, st: 6.35029318, oz: 0.028349523 },
  { km: 1, mi: 1.609344, m: 0.001, cm: 0.00001, ft: 0.0003048, yd: 0.0009144, in: 0.0000254 },
  { kcal: 1, Cal: 1, cal: 0.001, kJ: 0.239005736, J: 0.000239005736 },
  { min: 1, s: 1 / 60, hr: 60, ms: 1 / 60000 },
  { mL: 1, L: 1000, fl_oz_us: 29.5735295625 },
]

/**
 * Convert between two units of the same dimension, so samples of one
 * metric recorded in mixed units (e.g. a scale app writing lb next to
 * Health's kg) aggregate correctly. Returns null when the units are
 * unknown or belong to different dimensions.
 */
function convertUnit(value: number, fromUnit: string, toUnit: string): number | null {
  if (fromUnit === toUnit) return value
  // Temperature is affine (offset, not just scale) — special-cased
  if (fromUnit === 'degF' && toUnit === 'degC') return (value - 32) / 1.8
  if (fromUnit === 'degC' && toUnit === 'degF') return value * 1.8 + 32
  for (const dimension of UNIT_DIMENSIONS) {
    const from = dimension[fromUnit]
    const to = dimension[toUnit]
    if (from !== undefined && to !== undefined) return (value * from) / to
  }
  return null
}

const BLOOD_TYPE_LABELS: Record<string, string> = {
  HKBloodTypeAPositive: 'A+',
  HKBloodTypeANegative: 'A-',
  HKBloodTypeBPositive: 'B+',
  HKBloodTypeBNegative: 'B-',
  HKBloodTypeABPositive: 'AB+',
  HKBloodTypeABNegative: 'AB-',
  HKBloodTypeOPositive: 'O+',
  HKBloodTypeONegative: 'O-',
}

const SEX_LABELS: Record<string, string> = {
  HKBiologicalSexMale: 'Male',
  HKBiologicalSexFemale: 'Female',
  HKBiologicalSexOther: 'Other',
}

interface SourceAgg {
  sum: number
  min: number
  max: number
  count: number
}

interface SleepRecord {
  startMs: number
  endMs: number
  startIso: string
  endIso: string
  endLocalDate: string
  stage: 'inBed' | 'awake' | 'core' | 'deep' | 'rem' | 'unspecified'
  source: string
}

interface WorkoutInProgress {
  attrs: XmlAttributes
  avgHeartRate: number | null
  maxHeartRate: number | null
  statDistanceKm: number | null
  statEnergyKcal: number | null
  elevationGainM: number | null
}

const INTERESTING_TAGS = new Set([
  'HealthData',
  'ExportDate',
  'Me',
  'Record',
  'Workout',
  'WorkoutStatistics',
  'MetadataEntry',
  'ActivitySummary',
])

export async function parseHealthExport(
  zipPath: string,
  onProgress: ProgressCallback
): Promise<ParsedHealthData> {
  const { entries } = await readZipDirectory(zipPath)

  const exportXml = findExportXml(entries)
  if (!exportXml) {
    throw new Error(
      'This zip does not look like an Apple Health export — no export data XML was found inside it.'
    )
  }
  const ecgEntries = entries
    .filter((e) => /electrocardiograms\/[^/]+\.csv$/i.test(e.path))
    .slice(0, MAX_ECG_FILES)
  const clinicalEntries = entries
    .filter((e) => /clinical-records\/[^/]+\.json$/i.test(e.path))
    .slice(0, MAX_CLINICAL_FILES)
  const gpxEntries = entries
    .filter((e) => /workout-routes\/[^/]+\.gpx$/i.test(e.path))
    .slice(0, MAX_GPX_FILES)

  const state: ParserState = {
    exportDate: null,
    locale: null,
    profile: {
      dateOfBirth: null,
      biologicalSex: null,
      bloodType: null,
      height: null,
      bodyMass: null,
    },
    recordsParsed: 0,
    agg: new Map(),
    aggEntryCount: 0,
    unitByType: new Map(),
    unitWarnings: new Set(),
    sleepRecords: [],
    workouts: [],
    activityDays: [],
    correlationDepth: 0,
    currentWorkout: null,
  }

  const xmlParser = new StreamingXmlParser(
    {
      onOpenTag: (name, attrs) => handleOpenTag(state, name, attrs),
      onCloseTag: (name) => handleCloseTag(state, name),
    },
    INTERESTING_TAGS
  )

  // ── Phase 1: stream export.xml (the dominant cost) ──
  let bytesRead = 0
  const totalBytes = Math.max(exportXml.uncompressedSize, 1)
  let lastProgressAt = 0

  const stream = await openZipEntryStream(zipPath, exportXml)
  const decoder = new StringDecoder('utf8')
  for await (const chunk of stream) {
    xmlParser.write(decoder.write(chunk as Buffer))
    bytesRead += (chunk as Buffer).length
    if (
      exportXml.uncompressedSize > 0 &&
      bytesRead > exportXml.uncompressedSize + MAX_DECLARED_SIZE_OVERSHOOT_BYTES
    ) {
      throw new Error('Corrupt zip: export.xml decompressed far past its declared size')
    }
    if (bytesRead > MAX_EXPORT_XML_BYTES) {
      throw new Error('export.xml exceeds the maximum supported decompressed size')
    }
    const now = Date.now()
    if (now - lastProgressAt > 400) {
      lastProgressAt = now
      await onProgress({
        percent: Math.min(84, 4 + Math.round((bytesRead / totalBytes) * 80)),
        phase: 'Parsing health records',
        recordsParsed: state.recordsParsed,
      })
    }
  }
  xmlParser.write(decoder.end())

  // ── Phase 2: ECG waveforms ──
  const ecgs: ParsedEcg[] = []
  for (let i = 0; i < ecgEntries.length; i++) {
    try {
      const buf = await readZipEntry(zipPath, ecgEntries[i], MAX_ECG_FILE_BYTES)
      const ecg = parseEcgCsv(buf.toString('utf8'))
      if (ecg) ecgs.push(ecg)
    } catch (err) {
      console.error(`[health-data] Skipping unreadable ECG file ${ecgEntries[i].path}:`, err)
    }
    if (i % 5 === 0) {
      await onProgress({
        percent: 84 + Math.round((i / Math.max(ecgEntries.length, 1)) * 4),
        phase: 'Parsing ECG recordings',
        recordsParsed: state.recordsParsed,
      })
    }
  }
  ecgs.sort((a, b) => (b.recordedAt ?? '').localeCompare(a.recordedAt ?? ''))

  // ── Phase 3: workout routes (GPX) ──
  const routes: ParsedRoute[] = []
  for (let i = 0; i < gpxEntries.length; i++) {
    try {
      const buf = await readZipEntry(zipPath, gpxEntries[i], MAX_GPX_FILE_BYTES)
      const route = parseGpx(buf.toString('utf8'), gpxEntries[i].path)
      if (route) routes.push(route)
    } catch (err) {
      console.error(`[health-data] Skipping unreadable route file ${gpxEntries[i].path}:`, err)
    }
    if (i % 10 === 0) {
      await onProgress({
        percent: 88 + Math.round((i / Math.max(gpxEntries.length, 1)) * 7),
        phase: 'Parsing workout routes',
        recordsParsed: state.recordsParsed,
      })
    }
  }
  routes.sort((a, b) => a.routeDate.localeCompare(b.routeDate))

  // ── Phase 4: clinical records ──
  const clinical: ParsedClinicalRecord[] = []
  for (const entry of clinicalEntries) {
    try {
      const buf = await readZipEntry(zipPath, entry, MAX_CLINICAL_FILE_BYTES)
      const record = parseClinicalJson(buf.toString('utf8'))
      if (record) clinical.push(record)
    } catch (err) {
      console.error(`[health-data] Skipping unreadable clinical record ${entry.path}:`, err)
    }
  }
  clinical.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
  await onProgress({ percent: 96, phase: 'Summarizing', recordsParsed: state.recordsParsed })

  return {
    exportDate: state.exportDate,
    locale: state.locale,
    profile: state.profile,
    clinical,
    dailyMetrics: flattenDailyMetrics(state.agg, state.unitByType),
    workouts: state.workouts,
    activityDays: state.activityDays,
    sleepNights: aggregateSleepNights(state.sleepRecords),
    ecgs,
    routes,
    recordsParsed: state.recordsParsed,
  }
}

interface ParserState {
  exportDate: string | null
  locale: string | null
  profile: HealthProfile
  recordsParsed: number
  /** metricType -> date -> sourceName -> aggregate */
  agg: Map<string, Map<string, Map<string, SourceAgg>>>
  /** Total (type, date, source) leaves in `agg`, for the memory ceiling */
  aggEntryCount: number
  unitByType: Map<string, string | null>
  /** Metric types already warned about for inconvertible units */
  unitWarnings: Set<string>
  sleepRecords: SleepRecord[]
  workouts: ParsedWorkout[]
  activityDays: ParsedActivityDay[]
  correlationDepth: number
  currentWorkout: WorkoutInProgress | null
}

function handleOpenTag(state: ParserState, name: string, attrs: XmlAttributes): void {
  switch (name) {
    case 'Record':
      state.recordsParsed++
      // Records nested in a Correlation are duplicated at the top level
      // of the document, so only count the top-level occurrence.
      if (state.correlationDepth === 0 && state.currentWorkout === null) {
        handleRecord(state, attrs)
      }
      return
    case 'MetadataEntry':
      if (state.currentWorkout && attrs.key === 'HKElevationAscended') {
        const match = /^([\d.]+)\s*(\w+)$/.exec(attrs.value ?? '')
        if (match) {
          state.currentWorkout.elevationGainM = lengthToMeters(Number(match[1]), match[2])
        }
      }
      return
    case 'WorkoutStatistics':
      if (state.currentWorkout) {
        handleWorkoutStatistics(state.currentWorkout, attrs)
      }
      return
    case 'Workout':
      state.recordsParsed++
      state.currentWorkout = {
        attrs,
        avgHeartRate: null,
        maxHeartRate: null,
        statDistanceKm: null,
        statEnergyKcal: null,
        elevationGainM: null,
      }
      return
    case 'Correlation':
      state.recordsParsed++
      state.correlationDepth++
      return
    case 'ActivitySummary':
      state.recordsParsed++
      handleActivitySummary(state, attrs)
      return
    case 'Me':
      state.profile.dateOfBirth = attrs.HKCharacteristicTypeIdentifierDateOfBirth || null
      state.profile.biologicalSex = SEX_LABELS[attrs.HKCharacteristicTypeIdentifierBiologicalSex] ?? null
      state.profile.bloodType = BLOOD_TYPE_LABELS[attrs.HKCharacteristicTypeIdentifierBloodType] ?? null
      return
    case 'ExportDate':
      state.exportDate = appleDateToIso(attrs.value)
      return
    case 'HealthData':
      state.locale = attrs.locale || null
      return
  }
}

function handleCloseTag(state: ParserState, name: string): void {
  if (name === 'Workout') {
    if (state.currentWorkout) {
      finalizeWorkout(state)
    }
    return
  }
  if (name === 'Correlation') {
    state.correlationDepth = Math.max(0, state.correlationDepth - 1)
  }
}

const SLEEP_STAGE_BY_VALUE: Record<string, SleepRecord['stage']> = {
  HKCategoryValueSleepAnalysisInBed: 'inBed',
  HKCategoryValueSleepAnalysisAwake: 'awake',
  HKCategoryValueSleepAnalysisAsleepCore: 'core',
  HKCategoryValueSleepAnalysisAsleepDeep: 'deep',
  HKCategoryValueSleepAnalysisAsleepREM: 'rem',
  HKCategoryValueSleepAnalysisAsleep: 'unspecified',
  HKCategoryValueSleepAnalysisAsleepUnspecified: 'unspecified',
}

function handleRecord(state: ParserState, attrs: XmlAttributes): void {
  const type = attrs.type
  if (!type) return

  if (type === 'HKCategoryTypeIdentifierSleepAnalysis') {
    const stage = SLEEP_STAGE_BY_VALUE[attrs.value ?? '']
    const startIso = appleDateToIso(attrs.startDate)
    const endIso = appleDateToIso(attrs.endDate)
    if (!stage || !startIso || !endIso) return
    const startMs = Date.parse(startIso)
    const endMs = Date.parse(endIso)
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return
    if (state.sleepRecords.length >= MAX_SLEEP_RECORDS) {
      throw new Error(`Export contains more than ${MAX_SLEEP_RECORDS} sleep records — aborting import`)
    }
    state.sleepRecords.push({
      startMs,
      endMs,
      startIso,
      endIso,
      endLocalDate: attrs.endDate.slice(0, 10),
      stage,
      source: attrs.sourceName ?? '',
    })
    return
  }

  if (!type.startsWith('HKQuantityTypeIdentifier')) return

  const value = toFinite(attrs.value)
  if (value === null) return
  const dateKey = attrs.startDate?.slice(0, 10)
  if (!dateKey || !DATE_KEY_REGEX.test(dateKey)) return

  const metricType = normalizeMetricType(type)
  const source = attrs.sourceName ?? ''
  const unit = attrs.unit ?? null

  // The first-seen unit wins per metric; later samples in another unit are
  // converted to it so mixed sources (e.g. lb + kg body mass) don't sum raw.
  let storedUnit = state.unitByType.get(metricType)
  if (storedUnit === undefined || (storedUnit === null && unit !== null)) {
    state.unitByType.set(metricType, unit)
    storedUnit = unit
  }
  let sample = value
  if (unit !== null && storedUnit !== null && unit !== storedUnit) {
    const converted = convertUnit(value, unit, storedUnit)
    if (converted === null) {
      if (!state.unitWarnings.has(metricType)) {
        state.unitWarnings.add(metricType)
        console.warn(
          `[health-data] Skipping ${metricType} samples in "${unit}" — cannot convert to "${storedUnit}"`
        )
      }
      return
    }
    sample = converted
  }

  let days = state.agg.get(metricType)
  if (!days) {
    days = new Map()
    state.agg.set(metricType, days)
  }
  let sources = days.get(dateKey)
  if (!sources) {
    sources = new Map()
    days.set(dateKey, sources)
  }
  const agg = sources.get(source)
  if (agg) {
    agg.sum += sample
    agg.count++
    if (sample < agg.min) agg.min = sample
    if (sample > agg.max) agg.max = sample
  } else {
    state.aggEntryCount++
    if (state.aggEntryCount > MAX_AGG_ENTRIES) {
      throw new Error(`Export contains more than ${MAX_AGG_ENTRIES} metric aggregates — aborting import`)
    }
    sources.set(source, { sum: sample, min: sample, max: sample, count: 1 })
  }

  // Track the most recent height / body mass sample for the profile card
  if (metricType === 'height' || metricType === 'body_mass') {
    const endDate = attrs.endDate ?? ''
    const current = state.profile[metricType === 'height' ? 'height' : 'bodyMass']
    if (!current || endDate.slice(0, 19) > current.date) {
      state.profile[metricType === 'height' ? 'height' : 'bodyMass'] = {
        value,
        unit: attrs.unit ?? '',
        date: endDate.slice(0, 19),
      }
    }
  }
}

function handleWorkoutStatistics(workout: WorkoutInProgress, attrs: XmlAttributes): void {
  switch (attrs.type) {
    case 'HKQuantityTypeIdentifierHeartRate':
      workout.avgHeartRate = toFinite(attrs.average)
      workout.maxHeartRate = toFinite(attrs.maximum)
      return
    case 'HKQuantityTypeIdentifierDistanceWalkingRunning':
    case 'HKQuantityTypeIdentifierDistanceCycling':
    case 'HKQuantityTypeIdentifierDistanceSwimming': {
      const sum = toFinite(attrs.sum)
      if (sum !== null) workout.statDistanceKm = distanceToKm(sum, attrs.unit)
      return
    }
    case 'HKQuantityTypeIdentifierActiveEnergyBurned': {
      const sum = toFinite(attrs.sum)
      if (sum !== null) workout.statEnergyKcal = energyToKcal(sum, attrs.unit)
      return
    }
  }
}

function finalizeWorkout(state: ParserState): void {
  const workout = state.currentWorkout
  state.currentWorkout = null
  if (!workout) return
  const attrs = workout.attrs

  const startTime = appleDateToIso(attrs.startDate)
  const endTime = appleDateToIso(attrs.endDate)
  if (!startTime || !endTime || !attrs.workoutActivityType) return

  let durationMin = toFinite(attrs.duration)
  if (durationMin !== null) {
    if (attrs.durationUnit === 's' || attrs.durationUnit === 'sec') durationMin /= 60
    if (attrs.durationUnit === 'hr') durationMin *= 60
  }

  const totalDistance = toFinite(attrs.totalDistance)
  const distanceKm = totalDistance !== null && totalDistance > 0
    ? distanceToKm(totalDistance, attrs.totalDistanceUnit)
    : workout.statDistanceKm

  const totalEnergy = toFinite(attrs.totalEnergyBurned)
  const energyKcal = totalEnergy !== null && totalEnergy > 0
    ? energyToKcal(totalEnergy, attrs.totalEnergyBurnedUnit)
    : workout.statEnergyKcal

  if (state.workouts.length >= MAX_WORKOUTS) {
    throw new Error(`Export contains more than ${MAX_WORKOUTS} workouts — aborting import`)
  }
  state.workouts.push({
    activityType: attrs.workoutActivityType.replace('HKWorkoutActivityType', ''),
    startTime,
    endTime,
    durationMin,
    distanceKm,
    energyKcal,
    avgHeartRate: workout.avgHeartRate,
    maxHeartRate: workout.maxHeartRate,
    elevationGainM: workout.elevationGainM,
    sourceName: attrs.sourceName ?? null,
  })
}

function handleActivitySummary(state: ParserState, attrs: XmlAttributes): void {
  const day = attrs.dateComponents
  if (!day || !DATE_KEY_REGEX.test(day)) return
  if (state.activityDays.length >= MAX_ACTIVITY_DAYS) {
    throw new Error(`Export contains more than ${MAX_ACTIVITY_DAYS} activity summaries — aborting import`)
  }
  state.activityDays.push({
    day,
    activeEnergy: toFinite(attrs.activeEnergyBurned),
    activeEnergyGoal: toFinite(attrs.activeEnergyBurnedGoal),
    exerciseMinutes: toFinite(attrs.appleExerciseTime),
    exerciseGoal: toFinite(attrs.appleExerciseTimeGoal),
    standHours: toFinite(attrs.appleStandHours),
    standGoal: toFinite(attrs.appleStandHoursGoal),
  })
}

/**
 * Collapse the (type, date, source) aggregates into one row per type+date.
 *
 * Multiple sources (iPhone + Apple Watch) record the same cumulative
 * metrics simultaneously; summing them would double-count, so cumulative
 * metrics take the source with the highest daily total (mirroring how
 * Apple's Health app deduplicates). Sampled metrics merge all sources.
 */
function flattenDailyMetrics(
  agg: Map<string, Map<string, Map<string, SourceAgg>>>,
  unitByType: Map<string, string | null>
): ParsedDailyMetric[] {
  const rows: ParsedDailyMetric[] = []
  for (const [metricType, days] of agg) {
    const cumulative = isCumulative(metricType)
    const unit = unitByType.get(metricType) ?? null
    for (const [date, sources] of days) {
      let merged: SourceAgg | null = null
      if (cumulative) {
        for (const sourceAgg of sources.values()) {
          if (!merged || sourceAgg.sum > merged.sum) merged = sourceAgg
        }
      } else {
        for (const sourceAgg of sources.values()) {
          if (!merged) {
            merged = { ...sourceAgg }
          } else {
            merged.sum += sourceAgg.sum
            merged.count += sourceAgg.count
            if (sourceAgg.min < merged.min) merged.min = sourceAgg.min
            if (sourceAgg.max > merged.max) merged.max = sourceAgg.max
          }
        }
      }
      if (!merged || merged.count === 0) continue
      rows.push({
        metricType,
        metricDate: date,
        unit,
        valueSum: merged.sum,
        valueMin: merged.min,
        valueMax: merged.max,
        valueAvg: merged.sum / merged.count,
        sampleCount: merged.count,
      })
    }
  }
  return rows
}

/**
 * Group raw sleep records into sessions (6h+ gaps start a new session),
 * dedupe overlapping sources, and label each session by wake date.
 */
function aggregateSleepNights(records: SleepRecord[]): ParsedSleepNight[] {
  if (records.length === 0) return []
  records.sort((a, b) => a.startMs - b.startMs)

  const sessions: SleepRecord[][] = []
  let current: SleepRecord[] = []
  let currentEnd = -Infinity
  for (const record of records) {
    if (current.length > 0 && record.startMs - currentEnd > SLEEP_SESSION_GAP_MS) {
      sessions.push(current)
      current = []
      currentEnd = -Infinity
    }
    current.push(record)
    if (record.endMs > currentEnd) currentEnd = record.endMs
  }
  if (current.length > 0) sessions.push(current)

  const byNight = new Map<string, ParsedSleepNight>()

  for (const session of sessions) {
    // Per-source totals so overlapping iPhone + Watch data is not summed
    const bySource = new Map<string, Record<SleepRecord['stage'], number>>()
    let startIso = session[0].startIso
    let endIso = session[0].endIso
    let endMs = session[0].endMs
    let nightDate = session[0].endLocalDate
    for (const record of session) {
      let totals = bySource.get(record.source)
      if (!totals) {
        totals = { inBed: 0, awake: 0, core: 0, deep: 0, rem: 0, unspecified: 0 }
        bySource.set(record.source, totals)
      }
      totals[record.stage] += (record.endMs - record.startMs) / 60000
      if (record.startIso < startIso) startIso = record.startIso
      if (record.endMs > endMs) {
        endMs = record.endMs
        endIso = record.endIso
        nightDate = record.endLocalDate
      }
    }

    // Stage breakdown comes from the source with the most recorded sleep
    // (the Watch); in-bed time takes the max across sources (the iPhone).
    let stageSource: Record<SleepRecord['stage'], number> | null = null
    let bestAsleep = 0
    let inBedMin = 0
    for (const totals of bySource.values()) {
      const asleep = totals.core + totals.deep + totals.rem + totals.unspecified
      if (asleep > bestAsleep || stageSource === null) {
        bestAsleep = asleep
        stageSource = totals
      }
      if (totals.inBed > inBedMin) inBedMin = totals.inBed
    }
    if (!stageSource) continue

    const asleepMin = stageSource.core + stageSource.deep + stageSource.rem + stageSource.unspecified
    if (asleepMin < MIN_SLEEP_SESSION_MIN && inBedMin < MIN_SLEEP_SESSION_MIN) continue

    const night: ParsedSleepNight = {
      nightDate,
      startTime: startIso,
      endTime: endIso,
      inBedMin: inBedMin > 0 ? inBedMin : null,
      asleepMin: asleepMin > 0 ? asleepMin : null,
      coreMin: stageSource.core > 0 ? stageSource.core : null,
      deepMin: stageSource.deep > 0 ? stageSource.deep : null,
      remMin: stageSource.rem > 0 ? stageSource.rem : null,
      awakeMin: stageSource.awake > 0 ? stageSource.awake : null,
    }

    const existing = byNight.get(nightDate)
    if (!existing) {
      byNight.set(nightDate, night)
    } else {
      // Multiple sessions ending on the same date (nap + night sleep)
      existing.inBedMin = sumNullable(existing.inBedMin, night.inBedMin)
      existing.asleepMin = sumNullable(existing.asleepMin, night.asleepMin)
      existing.coreMin = sumNullable(existing.coreMin, night.coreMin)
      existing.deepMin = sumNullable(existing.deepMin, night.deepMin)
      existing.remMin = sumNullable(existing.remMin, night.remMin)
      existing.awakeMin = sumNullable(existing.awakeMin, night.awakeMin)
      if (night.startTime && existing.startTime && night.startTime < existing.startTime) {
        existing.startTime = night.startTime
      }
      if (night.endTime && existing.endTime && night.endTime > existing.endTime) {
        existing.endTime = night.endTime
      }
    }
  }

  return Array.from(byNight.values()).sort((a, b) => a.nightDate.localeCompare(b.nightDate))
}

function sumNullable(a: number | null, b: number | null): number | null {
  if (a === null) return b
  if (b === null) return a
  return a + b
}

/** parseFloat that also accepts a comma decimal separator ("511,9 Hz") */
function parseLocaleFloat(value: string): number {
  return parseFloat(value.replace(/^(-?\d+),(\d+)/, '$1.$2'))
}

/**
 * Parse an Apple Watch ECG CSV: `Key,Value` header lines followed by one
 * voltage sample (µV) per line. The waveform is downsampled by bucket
 * averaging to at most ECG_WAVEFORM_POINTS points. Apple writes these
 * files in the device locale — header keys are translated and decimals
 * may use a ',' separator.
 */
function parseEcgCsv(text: string): ParsedEcg | null {
  const lines = text.split(/\r?\n/)
  let recordedAt: string | null = null
  let classification: string | null = null
  let symptoms: string | null = null
  let device: string | null = null
  let samplingFrequencyHz: number | null = null
  let averageHeartRate: number | null = null
  let firstDateValue: string | null = null
  const samples: number[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed === ',') continue
    // Sample lines may carry a trailing ',' and, in comma-decimal locales,
    // a ',' decimal separator ("-24,8")
    let sampleText = trimmed.endsWith(',') ? trimmed.slice(0, -1) : trimmed
    if (/^-?\d+,\d+$/.test(sampleText)) sampleText = sampleText.replace(',', '.')
    if (/^-?\d+(\.\d+)?$/.test(sampleText)) {
      samples.push(Number(sampleText))
      continue
    }
    const commaIdx = trimmed.indexOf(',')
    if (commaIdx === -1) continue
    const key = trimmed.slice(0, commaIdx).trim().toLowerCase()
    let value = trimmed.slice(commaIdx + 1).trim()
    // CSV-quoted values, e.g. Device,"Watch6,7"
    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
      value = value.slice(1, -1)
    }
    if (firstDateValue === null && /\d{4}-\d{2}-\d{2}/.test(value)) {
      firstDateValue = value
    }
    if (key.includes('recorded')) {
      recordedAt = appleDateToIso(value) ?? (value || null)
    } else if (key.includes('classification')) {
      classification = value || null
    } else if (key.includes('symptom')) {
      symptoms = value || null
    } else if (key.includes('device')) {
      device = value || null
    } else if (key.includes('sample rate')) {
      const freq = parseLocaleFloat(value)
      if (Number.isFinite(freq) && freq > 0) samplingFrequencyHz = freq
    } else if (key.includes('heart rate')) {
      const hr = parseLocaleFloat(value)
      if (Number.isFinite(hr) && hr > 0) averageHeartRate = hr
    }
  }

  // Localized headers won't match the English 'recorded' key; fall back to
  // the first metadata value that looks like a date
  if (recordedAt === null && firstDateValue !== null) {
    recordedAt = appleDateToIso(firstDateValue) ?? firstDateValue
  }

  if (samples.length === 0) return null
  if (samples.length > MAX_ECG_FULL_SAMPLES) samples.length = MAX_ECG_FULL_SAMPLES

  return {
    recordedAt,
    classification,
    symptoms,
    averageHeartRate,
    samplingFrequencyHz,
    sampleCount: samples.length,
    durationSec: samplingFrequencyHz ? samples.length / samplingFrequencyHz : null,
    device,
    waveform: downsample(samples, ECG_WAVEFORM_POINTS),
    waveformFull: samples.map((v) => Math.round(v * 10) / 10),
  }
}

function downsample(samples: number[], maxPoints: number): number[] {
  if (samples.length <= maxPoints) {
    return samples.map((v) => Math.round(v * 10) / 10)
  }
  const bucketSize = samples.length / maxPoints
  const points: number[] = new Array(maxPoints)
  for (let i = 0; i < maxPoints; i++) {
    const start = Math.floor(i * bucketSize)
    const end = Math.min(Math.floor((i + 1) * bucketSize), samples.length)
    let sum = 0
    for (let j = start; j < end; j++) sum += samples[j]
    points[i] = Math.round((sum / Math.max(end - start, 1)) * 10) / 10
  }
  return points
}

/**
 * Common CVX vaccine codes → display names, for immunization records that
 * carry only a bare code (typical of SMART Health Card imports).
 */
const CVX_NAMES: Record<string, string> = {
  '207': 'COVID-19 Vaccine (Moderna)',
  '208': 'COVID-19 Vaccine (Pfizer-BioNTech)',
  '210': 'COVID-19 Vaccine (AstraZeneca)',
  '212': 'COVID-19 Vaccine (Janssen)',
  '229': 'COVID-19 Vaccine (Moderna, bivalent)',
  '300': 'COVID-19 Vaccine (Pfizer-BioNTech, bivalent)',
  '88': 'Influenza Vaccine',
  '140': 'Influenza Vaccine (seasonal)',
  '141': 'Influenza Vaccine (seasonal)',
  '115': 'Tdap Vaccine',
  '33': 'Pneumococcal Vaccine',
  '121': 'Zoster Vaccine',
}

/**
 * Parse an Apple Health workout-route GPX file: extract the track points,
 * compute total distance (haversine over the full-resolution track), and
 * downsample the path for thumbnail rendering. The route's local date
 * comes from the filename (route_YYYY-MM-DD_H.MMpm.gpx); the trackpoint
 * <time> values (UTC) provide start time and duration.
 */
function parseGpx(text: string, filePath: string): ParsedRoute | null {
  const lats: number[] = []
  const lons: number[] = []
  const trkptRegex = /<trkpt\b([^>]*)>/g
  let match: RegExpExecArray | null
  while ((match = trkptRegex.exec(text)) !== null) {
    const attrs = match[1]
    const latMatch = /lat="(-?[\d.]+)"/.exec(attrs)
    const lonMatch = /lon="(-?[\d.]+)"/.exec(attrs)
    if (!latMatch || !lonMatch) continue
    const lat = Number(latMatch[1])
    const lon = Number(lonMatch[1])
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      lats.push(lat)
      lons.push(lon)
    }
  }
  if (lats.length < 2) return null

  let distanceKm = 0
  for (let i = 1; i < lats.length; i++) {
    distanceKm += haversineKm(lats[i - 1], lons[i - 1], lats[i], lons[i])
  }

  // The document's first <time> is Apple's metadata timestamp (export
  // time, not the workout) — only times inside the track are meaningful.
  const trackStart = text.indexOf('<trkpt')
  const firstTime = trackStart !== -1
    ? /<time>([^<]+)<\/time>/.exec(text.slice(trackStart, trackStart + 2000))?.[1] ?? null
    : null
  const lastTimeIdx = text.lastIndexOf('<time>')
  const lastTime = lastTimeIdx > trackStart && lastTimeIdx !== -1
    ? /<time>([^<]+)<\/time>/.exec(text.slice(lastTimeIdx))?.[1] ?? null
    : null
  let durationMin: number | null = null
  if (firstTime && lastTime) {
    const ms = Date.parse(lastTime) - Date.parse(firstTime)
    if (Number.isFinite(ms) && ms > 0) durationMin = ms / 60000
  }

  // Local date from the filename; fall back to the (UTC) first timestamp
  const nameDate = /route_(\d{4}-\d{2}-\d{2})/.exec(filePath)?.[1]
  const routeDate = nameDate ?? (firstTime ? firstTime.slice(0, 10) : null)
  if (!routeDate) return null

  const stride = Math.max(1, Math.ceil(lats.length / ROUTE_MAX_POINTS))
  const points: Array<[number, number]> = []
  for (let i = 0; i < lats.length; i += stride) {
    points.push([round5(lats[i]), round5(lons[i])])
  }
  const lastIdx = lats.length - 1
  if (points[points.length - 1][0] !== round5(lats[lastIdx]) || points[points.length - 1][1] !== round5(lons[lastIdx])) {
    points.push([round5(lats[lastIdx]), round5(lons[lastIdx])])
  }

  return {
    routeDate,
    startedAt: firstTime,
    distanceKm,
    durationMin,
    pointCount: lats.length,
    points,
  }
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = Math.PI / 180
  const dLat = (lat2 - lat1) * toRad
  const dLon = (lon2 - lon1) * toRad
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(a))
}

function round5(value: number): number {
  return Math.round(value * 100000) / 100000
}

/** Extract a display summary from a FHIR clinical record JSON */
function parseClinicalJson(text: string): ParsedClinicalRecord | null {
  let resource: any
  try {
    resource = JSON.parse(text)
  } catch {
    return null
  }
  if (!resource || typeof resource.resourceType !== 'string') return null

  const vaccineCodings: Array<{ system?: string; code?: string; display?: string }> =
    resource.vaccineCode?.coding ?? []
  const cvxCode = vaccineCodings.find((c) => c.system?.includes('cvx'))?.code
  const cvxName = cvxCode ? CVX_NAMES[cvxCode] ?? `Immunization (CVX ${cvxCode})` : null

  const name: string =
    resource.vaccineCode?.text ||
    vaccineCodings.find((c) => c.display)?.display ||
    cvxName ||
    resource.code?.text ||
    resource.code?.coding?.[0]?.display ||
    resource.medicationCodeableConcept?.text ||
    resource.resourceType

  const date: string | null =
    resource.occurrenceDateTime ||
    resource.effectiveDateTime ||
    resource.date ||
    resource.issued ||
    null

  const location: string | null =
    resource.performer?.[0]?.actor?.display ||
    resource.location?.display ||
    null

  return {
    type: resource.resourceType,
    name: String(name).slice(0, 300),
    date: date ? String(date).slice(0, 10) : null,
    status: resource.status ? String(resource.status).slice(0, 50) : null,
    cvx: cvxCode ? String(cvxCode).slice(0, 10) : null,
    lot: resource.lotNumber ? String(resource.lotNumber).slice(0, 50) : null,
    location: location ? String(location).slice(0, 200) : null,
  }
}
