'use client'

import { useContext, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { BarChart3, Loader2, Plus, Square, Volume2 } from 'lucide-react'
import { useDefaultLayoutData, useListenBrief } from '@/modules/dashboard/hooks/use-default-layout'
import {
  ModuleWidgets,
  MorningBriefWidget,
  TaskActivityWidget,
} from '@/modules/dashboard/components/module-widgets'
import { QuickAddTaskContext } from '@/modules/tasks/components/quick-add-task-sheet'

const FALLBACK_BRIEF_MESSAGE = 'Everything is structured and ready — steady focus, as always.'

function greetingForHour(hour: number): string {
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function CleanCard({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return <Card className={`p-5 ${className}`}>{children}</Card>
}

function CardLabel({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <h2 className={`text-xs font-semibold uppercase tracking-[0.18em] ${className}`}>{children}</h2>
  )
}

function FeedSpinner() {
  return (
    <div className="flex justify-center py-8">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  )
}

export function DefaultDashboardLayout() {
  const router = useRouter()
  // Null when the tasks module (and its provider) is disabled — fall back to /tasks/add.
  const quickAddTask = useContext(QuickAddTaskContext)
  const {
    tasksEnabled,
    listenReady,
    firstName,
    weather,
    greeting,
    quote,
    topPriorities,
    tasks,
    tasksLoading,
  } = useDefaultLayoutData()

  // Date and greeting depend on the client clock — set after mount so the
  // server render never disagrees with the browser's timezone.
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => setNow(new Date()), [])

  const briefMessage = greeting?.message || FALLBACK_BRIEF_MESSAGE

  const greetingLine = now
    ? `${greetingForHour(now.getHours())}${firstName ? `, ${firstName}` : ''}.`
    : null

  const listenText = useMemo(() => {
    const parts: string[] = []
    if (greetingLine) parts.push(greetingLine)
    parts.push(briefMessage)
    if (topPriorities.length > 0) {
      parts.push("Today's top priorities:")
      topPriorities.forEach((task, index) => parts.push(`${index + 1}. ${task.title}.`))
    }
    if (quote) parts.push(`${quote.quote}${quote.author ? ` — ${quote.author}` : ''}`)
    return parts.join(' ')
  }, [greetingLine, briefMessage, topPriorities, quote])

  const listen = useListenBrief(listenText)

  const weatherSuffix =
    weather?.available && weather.high != null
      ? ` · ${Math.round(weather.high)}°${weather.city ? ` ${weather.city}` : ''}`
      : ''

  const openTasks = useMemo(() => tasks.filter((task) => !task.completed).slice(0, 10), [tasks])

  return (
    <div className="min-h-[calc(100svh-4rem)] bg-muted">
      <div className="mx-auto w-full max-w-[1500px] space-y-8 px-6 py-8 lg:px-10">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm tracking-wide text-muted-foreground">
              {now ? `${format(now, 'EEEE, MMMM d, yyyy')}${weatherSuffix}` : ' '}
            </p>
            <h1 className="mt-2 text-4xl font-bold tracking-tight">{greetingLine ?? ' '}</h1>
          </div>
          <div className="flex gap-3">
            {listenReady && (
              <Button
                variant="outline"
                onClick={listen.toggle}
                disabled={listen.state === 'loading'}
              >
                {listen.state === 'loading' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {listen.state === 'playing' && <Square className="mr-2 h-4 w-4" />}
                {listen.state === 'idle' && <Volume2 className="mr-2 h-4 w-4" />}
                {listen.state === 'playing' ? 'Stop' : 'Listen'}
              </Button>
            )}
            {tasksEnabled && (
              <Button variant="outline" onClick={() => router.push('/tasks/radar')}>
                <BarChart3 className="mr-2 h-4 w-4" />
                Priority Radar
              </Button>
            )}
            {tasksEnabled && (
              <Button
                onClick={() =>
                  quickAddTask ? quickAddTask.setOpen(true) : router.push('/tasks/add')
                }
              >
                <Plus className="mr-2 h-4 w-4" />
                New Task
              </Button>
            )}
          </div>
        </div>

        {/* Three-column layout */}
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
          {/* Left column */}
          <div className="space-y-6 lg:col-span-3">
            {/* Dashboard cards from every other enabled module (portfolio, ...) */}
            <ModuleWidgets />
          </div>

          {/* Middle column */}
          <div className="space-y-6 lg:col-span-6">
            {/* The Morning Brief module's own dashboard widget */}
            <MorningBriefWidget />

            {/* The Tasks module's activity chart widget */}
            <TaskActivityWidget />
          </div>

          {/* Right column */}
          <div className="lg:col-span-3">
            <CleanCard>
              <div className="mb-2 flex items-center justify-between gap-2">
                <CardLabel>Tasks</CardLabel>
                <Link href="/tasks" className="shrink-0 text-sm text-primary hover:underline">
                  View all {tasks.length}
                </Link>
              </div>
              {tasksLoading ? (
                <FeedSpinner />
              ) : openTasks.length === 0 ? (
                <p className="py-6 text-sm text-muted-foreground">No tasks yet.</p>
              ) : (
                <ul className="divide-y">
                  {openTasks.map((task) => (
                    <li key={task.id}>
                      <button
                        type="button"
                        className="block w-full truncate py-3.5 text-left font-medium text-foreground hover:underline"
                        onClick={() => router.push(`/tasks/edit/${task.id}`)}
                      >
                        {task.title}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </CleanCard>
          </div>
        </div>
      </div>
    </div>
  )
}
