// Client-safe HYROX utilities (no service role usage)
// For admin functions, use /lib/hyrox-admin.ts in server-only contexts

export type { HyroxStationRecord, HyroxWorkout, HyroxWorkoutStation } from './hyrox-types'

// Client-safe utility functions only (no database operations)

// Calculate progress percentage for a station
export function calculateProgress(currentTime: number, goalTime: number): number {
  if (currentTime <= goalTime) return 100
  const maxTime = goalTime * 1.5 // Consider 150% of goal as 0% progress
  const progress = ((maxTime - currentTime) / (maxTime - goalTime)) * 100
  return Math.max(0, Math.min(100, progress))
}

// Format milliseconds to MM:SS
export function formatTime(milliseconds: number): string {
  // If the time is 0 or invalid, return a placeholder
  if (!milliseconds || milliseconds === 0) {
    return '0:00'
  }
  const totalSeconds = Math.floor(milliseconds / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

// Get time difference for display (e.g., "+15s" or "-10s")
export function getTimeDifference(currentTime: number, goalTime: number): string {
  const diff = Math.abs(currentTime - goalTime) / 1000
  const sign = currentTime > goalTime ? '+' : '-'
  return `${sign}${Math.round(diff)}s`
}