"use client"

import { useRouter } from "next/navigation"
import { Bar, BarChart, CartesianGrid, XAxis, Cell } from "recharts"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  ArrowLeft,
  Loader2,
  Flame,
  Trophy,
  CalendarCheck,
  CalendarRange,
  Star,
  CheckCircle2,
  ListTodo,
  AlarmClock,
  Percent,
} from "lucide-react"
import { useTaskStats } from "@/modules/tasks/hooks/use-tasks"
import { TaskAnalyticsChart } from "@/modules/tasks/components/task-analytics-chart"
import { playTaskSound } from "@/modules/tasks/lib/task-sounds"

const chartConfig = {
  count: { label: "Completed", color: "hsl(var(--chart-1))" },
} satisfies ChartConfig

// Distinct palette for the priority bars (theme tokens, so it themes correctly).
const PRIORITY_COLORS: Record<string, string> = {
  High: "hsl(var(--chart-1))",
  Medium: "hsl(var(--chart-2))",
  Low: "hsl(var(--chart-3))",
}

const PRIORITY_BADGE: Record<string, string> = {
  High: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
  Medium: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  Low: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
}

function formatDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })
}

function formatInstant(iso: string, timeZone: string): string {
  const d = new Date(iso)
  return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", timeZone })} · ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", timeZone })}`
}

interface StatCardProps {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string | number
  hint?: string
}

function StatCard({ icon: Icon, label, value, hint }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-medium">{value}</div>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  )
}

export default function TasksAnalyticsPage() {
  const router = useRouter()
  const { data: stats, isLoading } = useTaskStats()

  const dayLabel = (n: number) => (n === 1 ? "day" : "days")

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-medium">Analytics</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every task you&apos;ve checked off, with streaks and trends.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            playTaskSound("button")
            router.push("/tasks")
          }}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Tasks
        </Button>
      </div>

      {isLoading || !stats ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Primary stat cards */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
            <StatCard icon={CheckCircle2} label="Total completed" value={stats.total_completed} />
            <StatCard
              icon={Flame}
              label="Current streak"
              value={stats.current_streak}
              hint={dayLabel(stats.current_streak)}
            />
            <StatCard
              icon={Trophy}
              label="Longest streak"
              value={stats.longest_streak}
              hint={dayLabel(stats.longest_streak)}
            />
            <StatCard icon={CalendarCheck} label="This week" value={stats.this_week} />
            <StatCard icon={CalendarRange} label="Active days" value={stats.active_days} />
            <StatCard
              icon={Star}
              label="All-time high"
              value={stats.best_day ? stats.best_day.count : 0}
              hint={stats.best_day ? formatDate(stats.best_day.date) : "in a single day"}
            />
          </div>

          {/* Task-specific secondary stats */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <StatCard icon={ListTodo} label="Open tasks" value={stats.open_tasks} />
            <StatCard icon={AlarmClock} label="Overdue" value={stats.overdue} />
            <StatCard icon={Percent} label="Completion rate" value={`${stats.completion_rate}%`} />
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Last 12 weeks</CardTitle>
                <CardDescription>Tasks completed per day</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={chartConfig} className="h-[240px] w-full">
                  <BarChart data={stats.daily} accessibilityLayer>
                    <CartesianGrid vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      minTickGap={24}
                      tickFormatter={(value: string) =>
                        new Date(`${value}T00:00:00Z`).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          timeZone: "UTC",
                        })
                      }
                    />
                    <ChartTooltip
                      content={<ChartTooltipContent labelFormatter={(value) => formatDate(String(value))} />}
                    />
                    <Bar dataKey="count" fill="var(--color-count)" radius={4} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>By weekday</CardTitle>
                <CardDescription>Completions bucketed by the day they were finished</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={chartConfig} className="h-[240px] w-full">
                  <BarChart data={stats.by_weekday} accessibilityLayer>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="count" fill="var(--color-count)" radius={4} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>By priority</CardTitle>
                <CardDescription>Completed tasks grouped by their priority</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={chartConfig} className="h-[240px] w-full">
                  <BarChart data={stats.by_priority} accessibilityLayer>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="priority" tickLine={false} axisLine={false} tickMargin={8} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="count" radius={4}>
                      {stats.by_priority.map((entry) => (
                        <Cell key={entry.priority} fill={PRIORITY_COLORS[entry.priority]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>

            {/* Reused created-vs-completed area chart (self-fetching) */}
            <TaskAnalyticsChart />
          </div>

          {/* Recently completed */}
          <Card>
            <CardHeader>
              <CardTitle>Recently completed</CardTitle>
              <CardDescription>Your most recently finished tasks</CardDescription>
            </CardHeader>
            <CardContent>
              {stats.recent.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  <CheckCircle2 className="mx-auto mb-2 h-10 w-10 opacity-40" />
                  No tasks completed yet. Check one off on the Tasks page to start your streak.
                </div>
              ) : (
                <div className="divide-y">
                  {stats.recent.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        playTaskSound("button")
                        router.push(`/tasks/edit/${t.id}`)
                      }}
                      className="flex w-full items-center justify-between gap-3 py-3 text-left transition-colors hover:bg-muted/50"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{t.title}</p>
                        <p className="text-xs text-muted-foreground">{formatInstant(t.completed_at, stats.timezone)}</p>
                      </div>
                      <Badge variant="outline" className={`shrink-0 ${PRIORITY_BADGE[t.priority]}`}>
                        {t.priority}
                      </Badge>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
