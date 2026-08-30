/**
 * Tasks — Stats API (analytics for the Analytics page).
 *
 * Aggregates the task table into the numbers the Analytics page shows: totals,
 * per-weekday buckets, per-priority buckets, this-week count, current & longest
 * streaks, all-time best day, a dense daily series for charting, and a recent
 * completions log. Completion time comes from the `completed_at` column stamped
 * by the PUT handler.
 *
 * SHARED model (matches the existing /analytics route): reads go through
 * withRLS with no user_id filter, and soft-deleted tasks are excluded. Day
 * boundaries follow the user's Settings timezone (user_preferences.timezone),
 * so "today", streaks, and daily buckets mean the user's local day.
 */

import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { createErrorResponse } from '@/lib/api-helpers'
import { TaskStatsResponseSchema } from '@/modules/tasks/lib/validation'
import {
  WEEKDAYS,
  addDays,
  startOfIsoWeek,
  isoWeekdayFromDate,
  currentDayStreak,
  computeLongestStreak,
  todayInTimeZone,
  dateStrInTimeZone,
} from '@/modules/tasks/lib/analytics-utils'
import { getUserTimeZone } from '@/modules/tasks/lib/server'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, InternalServerErrorResponse, UnauthorizedResponse } from '@/lib/openapi/common'
import { tasks } from '@/lib/db/schema'
import { notDeleted, visibleTo } from '@/modules/tasks/lib/task-query'
import { and, eq, desc, isNotNull, count, sql } from 'drizzle-orm'

const CHART_DAYS = 84 // ~12 weeks of daily bars
const PRIORITIES = ['High', 'Medium', 'Low'] as const

registry.registerPath({
  method: 'get',
  path: '/api/modules/tasks/stats',
  operationId: 'getTaskStats',
  summary: 'Aggregated task completion analytics (totals, streaks, weekday & priority buckets)',
  tags: ['tasks'],
  security: DEFAULT_SECURITY,
  responses: {
    200: {
      description: 'Aggregated task stats',
      content: { 'application/json': { schema: TaskStatsResponseSchema } },
    },
    401: UnauthorizedResponse,
    500: InternalServerErrorResponse,
  },
})

function coercePriority(p: string | null): 'High' | 'Medium' | 'Low' {
  return p === 'High' || p === 'Low' ? p : 'Medium'
}

export async function GET() {
  try {
    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const timezone = await getUserTimeZone(withRLS, user.id)
    const today = todayInTimeZone(timezone)
    const weekStart = startOfIsoWeek(today)

    const { completedRows, openCount, overdueCount, totalCount } = await withRLS(async (db) => {
      const completed = await db
        .select({
          id: tasks.id,
          title: tasks.title,
          priority: tasks.priority,
          completedAt: tasks.completedAt,
        })
        .from(tasks)
        .where(
          and(
            eq(tasks.completed, true),
            notDeleted(),
            visibleTo(user.id),
            isNotNull(tasks.completedAt),
          ),
        )
        .orderBy(desc(tasks.completedAt))

      const openAgg = await db
        .select({ c: count() })
        .from(tasks)
        .where(and(eq(tasks.completed, false), notDeleted(), visibleTo(user.id)))

      const overdueAgg = await db
        .select({ c: count() })
        .from(tasks)
        .where(
          and(
            eq(tasks.completed, false),
            notDeleted(),
            visibleTo(user.id),
            sql`${tasks.dueDate} < ${today}`,
          ),
        )

      const totalAgg = await db
        .select({ c: count() })
        .from(tasks)
        .where(and(notDeleted(), visibleTo(user.id)))

      return {
        completedRows: completed,
        openCount: Number(openAgg[0]?.c ?? 0),
        overdueCount: Number(overdueAgg[0]?.c ?? 0),
        totalCount: Number(totalAgg[0]?.c ?? 0),
      }
    })

    // Bucket completions by local day (user's timezone), ISO weekday, and priority.
    const dayCount = new Map<string, number>()
    const weekdayCount = new Map<number, number>()
    const priorityCount = new Map<string, number>()
    for (const r of completedRows) {
      if (!r.completedAt) continue
      const day = dateStrInTimeZone(r.completedAt, timezone)
      dayCount.set(day, (dayCount.get(day) ?? 0) + 1)
      const wd = isoWeekdayFromDate(day)
      weekdayCount.set(wd, (weekdayCount.get(wd) ?? 0) + 1)
      const p = coercePriority(r.priority)
      priorityCount.set(p, (priorityCount.get(p) ?? 0) + 1)
    }

    const totalCompleted = completedRows.length
    const activeDates = Array.from(dayCount.keys()).sort()
    const activeDays = activeDates.length
    const thisWeek = activeDates
      .filter((d) => d >= weekStart && d <= today)
      .reduce((sum, d) => sum + (dayCount.get(d) ?? 0), 0)

    const dateSet = new Set(activeDates)
    const currentStreak = currentDayStreak(dateSet, today)
    const longestStreak = computeLongestStreak(activeDates)

    let bestDay: { date: string; count: number } | null = null
    for (const [date, c] of dayCount) {
      if (!bestDay || c > bestDay.count) bestDay = { date, count: c }
    }

    const byWeekday = WEEKDAYS.map((d) => ({
      day_of_week: d.value,
      label: d.short,
      count: weekdayCount.get(d.value) ?? 0,
    }))

    const byPriority = PRIORITIES.map((p) => ({ priority: p, count: priorityCount.get(p) ?? 0 }))

    // Dense daily series for the chart (fill gaps with 0 so bars are evenly spaced).
    const chartStart = addDays(today, -(CHART_DAYS - 1))
    const daily: { date: string; count: number }[] = []
    for (let cursor = chartStart; cursor <= today; cursor = addDays(cursor, 1)) {
      daily.push({ date: cursor, count: dayCount.get(cursor) ?? 0 })
    }

    const completionRate = totalCount > 0 ? Math.round((totalCompleted / totalCount) * 1000) / 10 : 0

    const recent = completedRows.slice(0, 50).map((r) => ({
      id: r.id,
      title: r.title,
      priority: coercePriority(r.priority),
      completed_at: r.completedAt as string,
    }))

    return NextResponse.json({
      timezone,
      total_completed: totalCompleted,
      active_days: activeDays,
      this_week: thisWeek,
      current_streak: currentStreak,
      longest_streak: longestStreak,
      best_day: bestDay,
      by_weekday: byWeekday,
      by_priority: byPriority,
      daily,
      open_tasks: openCount,
      overdue: overdueCount,
      completion_rate: completionRate,
      recent,
    })
  } catch (error) {
    console.error('GET /api/modules/tasks/stats error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}
