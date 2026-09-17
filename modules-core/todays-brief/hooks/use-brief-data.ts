'use client'

/**
 * Today's Brief - shared data orchestration.
 *
 * Composes every query the brief needs and returns ready-to-spread props for
 * <BriefView />, plus readiness flags and a refresh helper. Used by BOTH the
 * module page and the dashboard widget so they render the identical brief
 * without duplicating the gating logic.
 */

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useModuleEnabled } from '@/lib/modules/module-hooks'
import { formatBriefDate } from '@/modules/todays-brief/lib/format'
import {
  useTodaysBriefSettings,
  useGoogleStatus,
  useIcalStatus,
  useTopTasks,
  useCalendar,
  useWeather,
  useGreeting,
  useRandomQuote,
  CALENDAR_KEY,
  TOP_TASKS_KEY,
  WEATHER_KEY,
  QUOTE_KEY,
} from './use-todays-brief'

export function useBriefData() {
  const queryClient = useQueryClient()
  // Bumped by refresh(); see the greeting gating and refresh() below.
  const [refreshNonce, setRefreshNonce] = useState(0)

  // Prerequisites. An AI provider is the only hard requirement to render a brief;
  // a calendar (Google OAuth or an iCal subscription) is optional.
  const { data: settings, isLoading: settingsLoading } = useTodaysBriefSettings()
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

  // Today's quote — only when the Quotes module is enabled (absent = no line).
  const { enabled: quotesEnabled, loading: quotesModuleLoading } = useModuleEnabled('quotes')
  const quote = useRandomQuote(quotesEnabled && !quotesModuleLoading)

  // The greeting needs the day's load to flavor its message, and the server
  // caches that message for the rest of the calendar day — so the FIRST request
  // decides what the brief says until tomorrow. It must not fire on provisional
  // counts.
  //
  // `calendarActive` and `tasksQueryEnabled` are false while their status
  // queries are still in flight, which makes the "settled" checks below vacuously
  // true. Without `sourcesKnown`, a settings query that resolves before the
  // Google/iCal status queries fires the greeting at 0 meetings and bakes
  // "your calendar is beautifully clear" in for the day. So wait until we know
  // which sources exist, *then* wait for those sources to return.
  const sourcesKnown = !settingsLoading && !googleLoading && !icalLoading && !tasksModuleLoading
  const tasksSettled = !tasksQueryEnabled || topTasks.isFetched
  const calendarSettled = !calendarActive || calendar.isFetched
  // Also hold while tasks/calendar are actively refetching. Without this, a
  // Refresh press fires the greeting immediately against the pre-refresh counts
  // and then a second time when the new counts land — two LLM calls, the first
  // one describing the old day.
  const countsInFlight = topTasks.isFetching || calendar.isFetching
  const greetingEnabled =
    aiReady && sourcesKnown && tasksSettled && calendarSettled && !countsInFlight
  const taskCount = topTasks.data?.length ?? 0
  const meetingCount = calendar.data?.events?.length ?? 0
  const greeting = useGreeting(taskCount, meetingCount, greetingEnabled, refreshNonce)

  // Refresh rebuilds the whole brief: tasks, calendar, weather, a freshly drawn
  // quote, and — via the nonce — a newly written greeting once the counts above
  // have settled. Narration is dropped by the caller (see BriefView), since the
  // clip it cached narrates the brief we are replacing.
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: CALENDAR_KEY })
    queryClient.invalidateQueries({ queryKey: TOP_TASKS_KEY })
    queryClient.invalidateQueries({ queryKey: WEATHER_KEY })
    queryClient.invalidateQueries({ queryKey: QUOTE_KEY })
    setRefreshNonce((n) => n + 1)
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
      // Stay in the loading state until the greeting query is actually enabled —
      // but only when there's nothing to show yet, so a refresh keeps the current
      // message on screen instead of flashing a skeleton.
      isLoading: (!greetingEnabled && !greeting.data) || greeting.isLoading,
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
    quote: quote.data ?? null,
  }

  return {
    ready: aiReady,
    prerequisitesLoading: settingsLoading || googleLoading || icalLoading,
    googleConnected,
    aiReady,
    briefProps,
    refresh,
    // The greeting is the last thing to settle, so the button keeps spinning
    // until the new message is actually on screen.
    isRefreshing:
      calendar.isFetching ||
      topTasks.isFetching ||
      weather.isFetching ||
      quote.isFetching ||
      greeting.isFetching,
  }
}
