/**
 * Memento Module - Utility Functions
 *
 * Helper functions for date calculations and grid generation.
 */

import type { MementoMilestone, MementoEra, WeekData, LifeStats } from '../types'

/**
 * Calculate the week number from birth date to a given date
 */
export function getWeekNumber(birthDate: Date, targetDate: Date): number {
  const msPerWeek = 7 * 24 * 60 * 60 * 1000
  const diffMs = targetDate.getTime() - birthDate.getTime()
  return Math.floor(diffMs / msPerWeek)
}

/**
 * Get the start date of a specific week number
 */
export function getWeekStartDate(birthDate: Date, weekNumber: number): Date {
  const msPerWeek = 7 * 24 * 60 * 60 * 1000
  return new Date(birthDate.getTime() + weekNumber * msPerWeek)
}

/**
 * Get the end date of a specific week number
 */
export function getWeekEndDate(birthDate: Date, weekNumber: number): Date {
  const startDate = getWeekStartDate(birthDate, weekNumber)
  return new Date(startDate.getTime() + 6 * 24 * 60 * 60 * 1000)
}

/**
 * Check if a date falls within an era
 */
export function isDateInEra(date: Date, era: MementoEra): boolean {
  const eraStart = new Date(era.start_date)
  const eraEnd = new Date(era.end_date)
  return date >= eraStart && date <= eraEnd
}

/**
 * Find the era for a specific week
 */
export function getEraForWeek(
  birthDate: Date,
  weekNumber: number,
  eras: MementoEra[]
): MementoEra | undefined {
  const weekStart = getWeekStartDate(birthDate, weekNumber)
  return eras.find(era => isDateInEra(weekStart, era))
}

/**
 * Generate all week data for the life grid
 */
export function generateWeekData(
  birthDate: Date,
  targetLifespan: number,
  milestones: MementoMilestone[],
  eras: MementoEra[]
): WeekData[] {
  const totalWeeks = targetLifespan * 52
  const now = new Date()
  const currentWeekNumber = getWeekNumber(birthDate, now)

  // Create a map of milestones by week number for fast lookup
  const milestoneMap = new Map<number, MementoMilestone>()
  milestones.forEach(m => milestoneMap.set(m.week_number, m))

  const weeks: WeekData[] = []

  for (let i = 0; i < totalWeeks; i++) {
    const startDate = getWeekStartDate(birthDate, i)
    const endDate = getWeekEndDate(birthDate, i)

    weeks.push({
      weekNumber: i,
      startDate,
      endDate,
      isLived: i < currentWeekNumber,
      isCurrent: i === currentWeekNumber,
      milestone: milestoneMap.get(i),
      era: getEraForWeek(birthDate, i, eras),
    })
  }

  return weeks
}

/**
 * Calculate life statistics
 */
export function calculateLifeStats(
  birthDate: Date,
  targetLifespan: number,
  milestones: MementoMilestone[],
  eras: MementoEra[]
): LifeStats {
  const now = new Date()
  const weeksLived = getWeekNumber(birthDate, now)
  const totalWeeks = targetLifespan * 52
  const weeksRemaining = Math.max(0, totalWeeks - weeksLived)
  const percentageLived = (weeksLived / totalWeeks) * 100

  return {
    weeksLived,
    weeksRemaining,
    totalWeeks,
    percentageLived,
    milestonesCount: milestones.length,
    erasCount: eras.length,
  }
}

/**
 * Get milestones from the same week in previous years
 */
export function getOnThisWeekMilestones(
  birthDate: Date,
  milestones: MementoMilestone[]
): MementoMilestone[] {
  const now = new Date()
  const currentWeekNumber = getWeekNumber(birthDate, now)

  // Get the week of year (0-51)
  const weekOfYear = currentWeekNumber % 52

  // Find milestones from the same week of year in previous years
  return milestones.filter(m => {
    const milestoneWeekOfYear = m.week_number % 52
    return milestoneWeekOfYear === weekOfYear && m.week_number !== currentWeekNumber
  })
}

/**
 * Get a random milestone from the past
 */
export function getRandomMilestone(milestones: MementoMilestone[]): MementoMilestone | undefined {
  if (milestones.length === 0) return undefined
  const randomIndex = Math.floor(Math.random() * milestones.length)
  return milestones[randomIndex]
}

/**
 * Format a date range for display
 */
export function formatDateRange(startDate: Date, endDate: Date): string {
  const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }
  const start = startDate.toLocaleDateString('en-US', options)
  const end = endDate.toLocaleDateString('en-US', options)
  return `${start} - ${end}`
}

/**
 * Format week number as year and week
 */
export function formatWeekAsYearWeek(weekNumber: number): string {
  const year = Math.floor(weekNumber / 52)
  const weekOfYear = weekNumber % 52 + 1
  return `Year ${year}, Week ${weekOfYear}`
}

/**
 * Get the year for a week number
 */
export function getYearForWeek(weekNumber: number): number {
  return Math.floor(weekNumber / 52)
}
