/**
 * Background import job: parses an uploaded Apple Health export zip and
 * persists the aggregated results, updating the import row's progress as
 * it goes. Kicked off (not awaited) by the upload route via next/server
 * after(); the client follows along by polling the status endpoint.
 *
 * The temp zip file is always deleted when the job ends, success or not.
 * If the import row disappears mid-run (user deleted their data or
 * uploaded a replacement), the job aborts quietly.
 */

import { unlink } from 'fs/promises'
import { and, eq, sql } from 'drizzle-orm'
import { withUserContext } from '@/lib/db'
import {
  healthDataImports,
  healthDataDailyMetrics,
  healthDataWorkouts,
  healthDataActivityDays,
  healthDataSleepNights,
  healthDataRoutes,
  healthDataEcgs,
} from '@/lib/db/schema'
import { parseHealthExport, type ParsedHealthData } from './parser'
import { STALE_PROCESSING_MS } from './retention'

const PROGRESS_UPDATE_INTERVAL_MS = 1500
const INSERT_CHUNK_SIZE = 500

class ImportAbortedError extends Error {
  constructor() {
    super('Import row no longer exists — aborting job')
    this.name = 'ImportAbortedError'
  }
}

export interface ImportJobParams {
  importId: string
  userId: string
  zipPath: string
}

export async function runImportJob({ importId, userId, zipPath }: ImportJobParams): Promise<void> {
  let lastUpdateAt = 0

  const updateImport = async (values: Record<string, unknown>): Promise<void> => {
    const updated = await withUserContext(userId, (db) =>
      db
        .update(healthDataImports)
        .set({ ...values, updatedAt: sql`now()` })
        .where(
          and(
            eq(healthDataImports.id, importId),
            eq(healthDataImports.userId, userId),
            eq(healthDataImports.status, 'processing')
          )
        )
        .returning({ id: healthDataImports.id })
    )
    if (updated.length === 0) {
      throw new ImportAbortedError()
    }
  }

  try {
    const parsed = await parseHealthExport(zipPath, async (progress) => {
      const now = Date.now()
      if (now - lastUpdateAt < PROGRESS_UPDATE_INTERVAL_MS) return
      lastUpdateAt = now
      await updateImport({
        progress: progress.percent,
        phase: progress.phase,
        recordsParsed: progress.recordsParsed,
      })
    })

    await updateImport({ progress: 97, phase: 'Saving summaries', recordsParsed: parsed.recordsParsed })
    // Heartbeat between insert batches: keeps updated_at fresh so the
    // retention layer's stale-processing check (5 min) can't mark a slow
    // but healthy persist as failed, and detects aborts (row deleted by a
    // replacement upload or "Delete now") mid-persist.
    await persistParsedData(userId, importId, parsed, () => updateImport({ phase: 'Saving summaries' }))

    await updateImport({
      status: 'completed',
      progress: 100,
      phase: 'Completed',
      recordsParsed: parsed.recordsParsed,
      exportDate: parsed.exportDate,
      locale: parsed.locale,
      profile: parsed.profile,
      clinical: parsed.clinical,
      error: null,
    })
  } catch (error) {
    if (error instanceof ImportAbortedError) {
      console.log(`[health-data] Import ${importId} aborted (row removed)`)
    } else {
      console.error(`[health-data] Import ${importId} failed:`, error)
      const message = error instanceof Error ? error.message.slice(0, 300) : 'Unknown error'
      try {
        await withUserContext(userId, (db) =>
          db
            .update(healthDataImports)
            .set({ status: 'failed', error: message, updatedAt: sql`now()` })
            .where(and(eq(healthDataImports.id, importId), eq(healthDataImports.userId, userId)))
        )
      } catch (updateError) {
        console.error(`[health-data] Failed to mark import ${importId} as failed:`, updateError)
      }
    }
  } finally {
    try {
      await unlink(zipPath)
    } catch {
      // Temp file may already be gone
    }
  }
}

/** Refresh updated_at at most this often during persist — must stay well under STALE_PROCESSING_MS or a healthy persist gets marked as dead */
const HEARTBEAT_INTERVAL_MS = STALE_PROCESSING_MS / 15 // 20s

async function persistParsedData(
  userId: string,
  importId: string,
  parsed: ParsedHealthData,
  heartbeat: () => Promise<void>
): Promise<void> {
  // Each chunk commits in its own transaction so the heartbeat (a separate
  // committed write) is visible to status pollers between chunks. Partial
  // data on failure is safe: reads are gated on status='completed', and the
  // failed import's child rows are removed by cascade on replace or expiry.
  const state = { lastBeat: Date.now(), heartbeat }
  await insertChunked(state, userId, healthDataDailyMetrics, parsed.dailyMetrics.map((m) => ({
      userId,
      importId,
      metricType: m.metricType,
      metricDate: m.metricDate,
      unit: m.unit,
      valueSum: m.valueSum,
      valueMin: m.valueMin,
      valueMax: m.valueMax,
      valueAvg: m.valueAvg,
      sampleCount: m.sampleCount,
    })))

  await insertChunked(state, userId, healthDataWorkouts, parsed.workouts.map((w) => ({
      userId,
      importId,
      activityType: w.activityType,
      startTime: w.startTime,
      endTime: w.endTime,
      durationMin: w.durationMin,
      distanceKm: w.distanceKm,
      energyKcal: w.energyKcal,
      avgHeartRate: w.avgHeartRate,
      maxHeartRate: w.maxHeartRate,
      elevationGainM: w.elevationGainM,
      sourceName: w.sourceName,
    })))

  await insertChunked(state, userId, healthDataActivityDays, parsed.activityDays.map((a) => ({
      userId,
      importId,
      day: a.day,
      activeEnergy: a.activeEnergy,
      activeEnergyGoal: a.activeEnergyGoal,
      exerciseMinutes: a.exerciseMinutes,
      exerciseGoal: a.exerciseGoal,
      standHours: a.standHours,
      standGoal: a.standGoal,
    })))

  await insertChunked(state, userId, healthDataSleepNights, parsed.sleepNights.map((s) => ({
      userId,
      importId,
      nightDate: s.nightDate,
      startTime: s.startTime,
      endTime: s.endTime,
      inBedMin: s.inBedMin,
      asleepMin: s.asleepMin,
      coreMin: s.coreMin,
      deepMin: s.deepMin,
      remMin: s.remMin,
      awakeMin: s.awakeMin,
    })))

  await insertChunked(state, userId, healthDataRoutes, parsed.routes.map((r) => ({
      userId,
      importId,
      routeDate: r.routeDate,
      startedAt: r.startedAt,
      distanceKm: r.distanceKm,
      durationMin: r.durationMin,
      pointCount: r.pointCount,
      points: r.points,
    })))

  await insertChunked(state, userId, healthDataEcgs, parsed.ecgs.map((e) => ({
      userId,
      importId,
      recordedAt: e.recordedAt,
      classification: e.classification,
      symptoms: e.symptoms,
      averageHeartRate: e.averageHeartRate,
      samplingFrequencyHz: e.samplingFrequencyHz,
      sampleCount: e.sampleCount,
      durationSec: e.durationSec,
      device: e.device,
      waveform: e.waveform,
      waveformFull: e.waveformFull,
    })))
}

interface PersistState {
  lastBeat: number
  heartbeat: () => Promise<void>
}

async function insertChunked(
  state: PersistState,
  userId: string,
  table: any,
  rows: Record<string, unknown>[]
): Promise<void> {
  for (let i = 0; i < rows.length; i += INSERT_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + INSERT_CHUNK_SIZE)
    if (chunk.length === 0) continue
    await withUserContext(userId, (db) => db.insert(table).values(chunk))
    if (Date.now() - state.lastBeat > HEARTBEAT_INTERVAL_MS) {
      state.lastBeat = Date.now()
      await state.heartbeat()
    }
  }
}
