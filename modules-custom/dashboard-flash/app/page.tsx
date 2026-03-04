'use client'

import { useAuth } from '@/components/providers'
import { useDashboardFlashData } from '@/lib/hooks/use-dashboard-flash'
import {
  Zap,
  CheckCircle2,
  AlertTriangle,
  Flame,
  Users,
  CircleDot,
  Clock,
  UserPlus,
  ListPlus,
  Loader2,
} from 'lucide-react'

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 6) return 'Good night'
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

function getUrgencyClass(dueDate: string | null): string {
  if (!dueDate) return 'bg-muted/60 text-muted-foreground'
  const due = new Date(dueDate)
  const now = new Date()
  const diffMs = due.getTime() - now.getTime()
  const diffDays = diffMs / (1000 * 60 * 60 * 24)
  if (diffDays < 0) return 'bg-red-500/15 text-red-600 dark:text-red-400'
  if (diffDays < 1) return 'bg-orange-500/15 text-orange-600 dark:text-orange-400'
  if (diffDays < 3) return 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
  return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
}

function getUrgencyLabel(dueDate: string | null): string {
  if (!dueDate) return 'No due date'
  const due = new Date(dueDate)
  const now = new Date()
  const diffMs = due.getTime() - now.getTime()
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`
  if (diffDays === 0) return 'Due today'
  if (diffDays === 1) return 'Due tomorrow'
  return `${diffDays}d left`
}

function relativeTime(timestamp: string): string {
  const now = Date.now()
  const then = new Date(timestamp).getTime()
  const diffSec = Math.floor((now - then) / 1000)
  if (diffSec < 60) return 'just now'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 7) return `${diffDay}d ago`
  return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function DashboardFlashPage() {
  const { user } = useAuth()
  const {
    tasksEnabled,
    fitnessEnabled,
    contactsEnabled,
    quotesEnabled,
    todaysFocus,
    recentWins,
    activeTasks,
    overdueTasks,
    completedToday,
    contactCount,
    fitnessStats,
    quote,
    recentActivity,
    isLoading,
    isDataLoading,
  } = useDashboardFlashData()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const firstName = user?.name?.split(' ')[0] || user?.email?.split('@')[0] || 'there'
  const now = new Date()

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      {/* Hero Greeting */}
      <section className="space-y-1 pt-2">
        <h1 className="text-4xl font-semibold tracking-tight">
          {getGreeting()}, {firstName}
        </h1>
        <p className="text-base text-muted-foreground">{formatDate(now)}</p>
      </section>

      {/* Spotlight Quote */}
      {quotesEnabled && quote && (
        <section className="border-l-2 border-primary/30 pl-5 py-1">
          <p className="text-lg font-light italic text-foreground/80 leading-relaxed">
            &ldquo;{quote.quote}&rdquo;
          </p>
          {quote.author && (
            <p className="text-sm text-muted-foreground mt-1.5">&mdash; {quote.author}</p>
          )}
        </section>
      )}

      {/* Pulse Strip */}
      {tasksEnabled && (
        <section className="flex flex-wrap gap-3">
          <PulseChip
            icon={<CircleDot className="w-3.5 h-3.5" />}
            label="Active"
            value={activeTasks}
          />
          <PulseChip
            icon={<AlertTriangle className="w-3.5 h-3.5" />}
            label="Overdue"
            value={overdueTasks}
            alert={overdueTasks > 0}
          />
          <PulseChip
            icon={<CheckCircle2 className="w-3.5 h-3.5" />}
            label="Done today"
            value={completedToday}
            positive={completedToday > 0}
          />
          {fitnessEnabled && (
            <PulseChip
              icon={<Flame className="w-3.5 h-3.5" />}
              label="Fitness"
              value={fitnessStats.totalCompletions}
            />
          )}
          {contactsEnabled && (
            <PulseChip
              icon={<Users className="w-3.5 h-3.5" />}
              label="Contacts"
              value={contactCount}
            />
          )}
        </section>
      )}

      {/* Two-column layout: Focus + Wins */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Today's Focus */}
        {tasksEnabled && (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Today&apos;s Focus
              </h2>
            </div>
            {todaysFocus.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/60 p-6 text-center">
                <p className="text-sm text-muted-foreground">No active tasks. Enjoy the calm.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {todaysFocus.map((task, i) => (
                  <div
                    key={task.id}
                    className="flex items-start gap-3 rounded-lg border border-border/50 bg-card p-3.5 transition-colors hover:bg-accent/30"
                  >
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center mt-0.5">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-snug truncate">{task.title}</p>
                      <span className={`inline-block text-[11px] font-medium mt-1 px-2 py-0.5 rounded-full ${getUrgencyClass(task.due_date)}`}>
                        {getUrgencyLabel(task.due_date)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Recent Wins */}
        {tasksEnabled && (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Recent Wins
              </h2>
            </div>
            {recentWins.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/60 p-6 text-center">
                <p className="text-sm text-muted-foreground">Complete a task to see it here.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {recentWins.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center gap-3 rounded-lg border border-border/50 bg-card p-3.5 transition-colors hover:bg-accent/30"
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{task.title}</p>
                    </div>
                    <span className="text-[11px] text-muted-foreground flex-shrink-0">
                      {relativeTime(task.updated_at)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      {/* Activity Stream */}
      {recentActivity.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Activity
            </h2>
          </div>
          <div className="space-y-1">
            {recentActivity.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 py-2 px-1 text-sm"
              >
                <ActivityIcon type={item.type} />
                <span className="flex-1 truncate text-foreground/80">{item.description}</span>
                <span className="text-[11px] text-muted-foreground flex-shrink-0">
                  {relativeTime(item.timestamp)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Loading indicator for data refresh */}
      {isDataLoading && (
        <div className="fixed bottom-4 right-4 bg-card border border-border/50 rounded-full px-3 py-1.5 shadow-sm flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="w-3 h-3 animate-spin" />
          Refreshing...
        </div>
      )}
    </div>
  )
}

function PulseChip({
  icon,
  label,
  value,
  alert = false,
  positive = false,
}: {
  icon: React.ReactNode
  label: string
  value: number
  alert?: boolean
  positive?: boolean
}) {
  let chipClass = 'border-border/50 text-foreground/70'
  if (alert) chipClass = 'border-red-500/30 text-red-600 dark:text-red-400 bg-red-500/5'
  else if (positive) chipClass = 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5'

  return (
    <div className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm ${chipClass}`}>
      {icon}
      <span className="font-semibold tabular-nums">{value}</span>
      <span className="text-muted-foreground text-xs">{label}</span>
    </div>
  )
}

function ActivityIcon({ type }: { type: string }) {
  switch (type) {
    case 'task_completed':
      return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
    case 'task_created':
      return <ListPlus className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
    case 'contact_added':
      return <UserPlus className="w-3.5 h-3.5 text-purple-500 flex-shrink-0" />
    default:
      return <CircleDot className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
  }
}
