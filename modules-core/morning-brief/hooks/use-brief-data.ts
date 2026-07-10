'use client'

/**
 * Morning Brief - shared data orchestration.
 *
 * Composes every query the brief needs and returns ready-to-spread props for
 * <BriefView />, plus readiness flags and a refresh helper. Used by BOTH the
 * module page and the dashboard widget so they render the identical brief
 * without duplicating the gating logic.
 */

import { useQueryClient } from '@tanstack/react-query'
import { useModuleEnabled } from '@/lib/modules/module-hooks'
import { formatBriefDate } from '@/modules/morning-brief/lib/format'
import {
  useMorningBriefSettings,
  useGoogleStatus,
  useIcalStatus,
  useTopTasks,
  useCalendar,
  useWeather,
  useGreeting,
  CALENDAR_KEY,
  TOP_TASKS_KEY,
  WEATHER_KEY,
} from './use-morning-brief'

export function useBriefData() {
  const queryClient = useQueryClient()

  // Prerequisites. An AI provider is the only hard requirement to render a brief;
  // a calendar (Google OAuth or an iCal subscription) is optional.
  const { data: settings, isLoading: settingsLoading } = useMorningBriefSettings()
  const { data: googleStatus, isLoading: googleLoading } = useGoogleStatus()
  const { data: icalStatus, isLoading: icalLoading } = useIcalStatus()
  const googleConnected = googleStatus?.connected ?? false
  const icalSubscribed = icalStatus?.subscribed ?? false
  const calendarActive = googleConnected || icalSubscribed
  const aiReady = !!settings?.selectedAiProvider

  // Live data — each gated on its prerequisite.
  const { enabled: tasksEnabled, loading: tasksModuleLoading } = useModuleEnabled('tasks')
  const tasksQueryEnabled = tasksEnabled && !tasksModuleLoading
  const topTasks = useTopTasks(tasksQueryEnabled)
  const calendar = useCalendar(calendarActive)
  const weather = useWeather(aiReady)

  // The greeting needs the day's load to flavor its message, so only fetch it
  // once tasks + calendar have settled (success or error).
  const tasksSettled = !tasksQueryEnabled || topTasks.isFetched
  const calendarSettled = !calendarActive || calendar.isFetched
  const greetingEnabled = aiReady && tasksSettled && calendarSettled
  const taskCount = topTasks.data?.length ?? 0
  const meetingCount = calendar.data?.events?.length ?? 0
  const greeting = useGreeting(taskCount, meetingCount, greetingEnabled)

  // Refresh only re-pulls the LIVE data (tasks + calendar + weather). The
  // greeting is the day's fixed message and is left alone.
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: CALENDAR_KEY })
    queryClient.invalidateQueries({ queryKey: TOP_TASKS_KEY })
    queryClient.invalidateQueries({ queryKey: WEATHER_KEY })
  }

  // Common loading/error fields shared by every <BriefView /> section.
  const sectionMeta = (q: { isLoading: boolean; isError: boolean; error: unknown }) => ({
    isLoading: q.isLoading,
    isError: q.isError,
    error: q.error,
  })

  // The exact prop subset <BriefView /> consumes (minus the action props).
  const briefProps = {
    dateLabel: formatBriefDate(greeting.data?.brief_date),
    greeting: {
      data: greeting.data,
      ...sectionMeta(greeting),
      // Stay in the loading state until the greeting query is actually enabled.
      isLoading: !greetingEnabled || greeting.isLoading,
    },
    tasks: { data: topTasks.data, ...sectionMeta(topTasks) },
    tasksEnabled,
    calendar: {
      // With no calendar source, synthesise a "not connected" state so the
      // schedule section renders its set-up prompt instead of "no meetings".
      data: !calendarActive
        ? { events: [], connected: false }
        : calendar.data
          ? { events: calendar.data.events, connected: calendar.data.connected }
          : undefined,
      ...sectionMeta(calendar),
    },
    weather: weather.data,
  }

  return {
    ready: aiReady,
    prerequisitesLoading: settingsLoading || googleLoading || icalLoading,
    googleConnected,
    aiReady,
    briefProps,
    refresh,
    isRefreshing: calendar.isFetching || topTasks.isFetching || weather.isFetching,
  }
}
