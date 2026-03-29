'use client'

import { useAuth } from '@/components/providers'
import { useDashboardFlashData } from '@/modules/dashboard-flash/hooks/use-dashboard-flash'
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
  Pin,
  Target,
  Dumbbell,
  Trophy,
  TrendingDown,
  CalendarDays,
  StickyNote,
  Compass,
  CheckSquare,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 6) return 'Good night'
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function formatCurrentDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

function getUrgencyClass(dueDate: string | null): string {
  if (!dueDate) return 'bg-muted/60 text-muted-foreground'
  const diffDays = (new Date(dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  if (diffDays < 0) return 'bg-red-500/15 text-red-600 dark:text-red-400'
  if (diffDays < 1) return 'bg-orange-500/15 text-orange-600 dark:text-orange-400'
  if (diffDays < 3) return 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
  return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
}

function getUrgencyLabel(dueDate: string | null): string {
  if (!dueDate) return 'No date'
  const diffDays = Math.ceil((new Date(dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`
  if (diffDays === 0) return 'Due today'
  if (diffDays === 1) return 'Tomorrow'
  return `${diffDays}d left`
}

function formatShortDate(date: string): string {
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function relativeTime(timestamp: string): string {
  const diffSec = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000)
  if (diffSec < 60) return 'just now'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 7) return `${diffDay}d ago`
  return formatShortDate(timestamp)
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function DashboardFlashPage() {
  const { user } = useAuth()
  const data = useDashboardFlashData()

  if (data.isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const firstName = user?.name?.split(' ')[0] || user?.email?.split('@')[0] || 'there'

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className="flex items-end justify-between gap-4">
        <div className="space-y-0.5">
          <h1 className="text-3xl font-semibold tracking-tight">
            {getGreeting()}, {firstName}
          </h1>
          <p className="text-sm text-muted-foreground">{formatCurrentDate(new Date())}</p>
        </div>
        {data.quotesEnabled && data.quote && (
          <p className="hidden lg:block text-sm italic text-muted-foreground max-w-md text-right leading-snug">
            &ldquo;{data.quote.quote}&rdquo;
            {data.quote.author && <span className="not-italic"> &mdash; {data.quote.author}</span>}
          </p>
        )}
      </header>

      {/* ── Stats Row ──────────────────────────────────────────────── */}
      {data.tasksEnabled && (
        <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard icon={<CheckSquare className="w-4 h-4" />} label="Total Tasks" value={data.tasks.length} sub={`${data.completedTasks.length} done`} accent="blue" />
          <StatCard icon={<AlertTriangle className="w-4 h-4" />} label="Overdue" value={data.overdueTasks.length} accent={data.overdueTasks.length > 0 ? 'red' : 'muted'} />
          <StatCard icon={<Clock className="w-4 h-4" />} label="Due Today" value={data.dueTodayTasks.length} accent={data.dueTodayTasks.length > 0 ? 'orange' : 'muted'} />
          <StatCard icon={<CircleDot className="w-4 h-4" />} label="Active" value={data.incompleteTasks.length} accent="indigo" />
          <StatCard icon={<CheckCircle2 className="w-4 h-4" />} label="Done Today" value={data.completedToday} accent={data.completedToday > 0 ? 'emerald' : 'muted'} />
          {data.fitnessEnabled ? (
            <StatCard icon={<Flame className="w-4 h-4" />} label="Fitness" value={data.fitnessStats.totalCompletions} accent="amber" />
          ) : data.contactsEnabled ? (
            <StatCard icon={<Users className="w-4 h-4" />} label="Contacts" value={data.contactCount} accent="purple" />
          ) : (
            <StatCard icon={<Target className="w-4 h-4" />} label="Pinned" value={data.pinnedTasks.length} accent="muted" />
          )}
        </section>
      )}

      {/* ── Main Grid ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Column 1: Focus + Overdue */}
        <div className="space-y-6">
          {/* Today's Focus */}
          {data.tasksEnabled && (
            <DashSection icon={<Zap className="w-4 h-4 text-primary" />} title="Today's Focus">
              {data.todaysFocus.length === 0 ? (
                <EmptyState text="No urgent tasks. Smooth sailing." />
              ) : (
                <div className="space-y-1.5">
                  {data.todaysFocus.map((task, i) => (
                    <div key={task.id} className="flex items-start gap-2.5 rounded-md border border-border/40 bg-card p-3 hover:bg-accent/20 transition-colors">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-[11px] font-bold flex items-center justify-center mt-0.5">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{task.title}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${getUrgencyClass(task.due_date)}`}>
                            {getUrgencyLabel(task.due_date)}
                          </span>
                          {task.priority_score != null && (
                            <span className="text-[10px] text-muted-foreground font-mono">P:{Number(task.priority_score).toFixed(1)}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </DashSection>
          )}

          {/* Overdue */}
          {data.tasksEnabled && data.overdueTasks.length > 0 && (
            <DashSection icon={<AlertTriangle className="w-4 h-4 text-red-500" />} title={`Overdue (${data.overdueTasks.length})`}>
              <div className="space-y-1">
                {data.overdueTasks.slice(0, 8).map((task) => (
                  <div key={task.id} className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-red-500/5 transition-colors">
                    <CircleDot className="w-3 h-3 text-red-500 flex-shrink-0" />
                    <span className="flex-1 text-sm truncate">{task.title}</span>
                    {task.due_date && (
                      <span className="text-[10px] text-red-500 flex-shrink-0 font-medium">{formatShortDate(task.due_date)}</span>
                    )}
                  </div>
                ))}
              </div>
            </DashSection>
          )}

          {/* Pinned */}
          {data.tasksEnabled && data.pinnedTasks.length > 0 && (
            <DashSection icon={<Pin className="w-4 h-4 text-blue-500" />} title={`Pinned (${data.pinnedTasks.length})`}>
              <div className="space-y-1">
                {data.pinnedTasks.map((task) => (
                  <div key={task.id} className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-blue-500/5 transition-colors">
                    <Pin className="w-3 h-3 text-blue-500 flex-shrink-0" />
                    <span className="flex-1 text-sm truncate">{task.title}</span>
                    {task.due_date && (
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${getUrgencyClass(task.due_date)}`}>
                        {formatShortDate(task.due_date)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </DashSection>
          )}
        </div>

        {/* Column 2: Priority + All Active Tasks */}
        <div className="space-y-6">
          {/* Top Priority */}
          {data.tasksEnabled && data.priorityTasks.length > 0 && (
            <DashSection icon={<Target className="w-4 h-4 text-orange-500" />} title={`Top Priority (${data.priorityTasks.length})`}>
              <div className="space-y-1">
                {data.priorityTasks.map((task, idx) => (
                  <div key={task.id} className="flex items-start gap-2 py-1.5 px-2 rounded-md hover:bg-accent/20 transition-colors">
                    <span className="text-[10px] text-muted-foreground font-mono mt-0.5 w-3">{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{task.title}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {task.due_date && (
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${getUrgencyClass(task.due_date)}`}>
                            {formatShortDate(task.due_date)}
                          </span>
                        )}
                        <span className="text-[10px] text-muted-foreground font-mono">P:{Number(task.priority_score).toFixed(1)}</span>
                        {task.impact && <span className="text-[10px] text-blue-500">I:{task.impact}</span>}
                        {task.severity && <span className="text-[10px] text-red-500">S:{task.severity}</span>}
                        {task.effort && <span className="text-[10px] text-purple-500">E:{task.effort}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </DashSection>
          )}

          {/* All Active Tasks */}
          {data.tasksEnabled && (
            <DashSection icon={<CheckSquare className="w-4 h-4 text-blue-500" />} title={`Active Tasks (${data.incompleteTasks.length})`}>
              {data.incompleteTasks.length === 0 ? (
                <EmptyState text="All tasks complete!" />
              ) : (
                <div className="space-y-0.5 max-h-[400px] overflow-y-auto">
                  {data.incompleteTasks.map((task) => (
                    <div key={task.id} className="flex items-center gap-2 py-1 px-2 rounded-md hover:bg-accent/20 transition-colors">
                      <CircleDot className="w-3 h-3 text-blue-400 flex-shrink-0" />
                      <span className="flex-1 text-sm truncate">{task.title}</span>
                      {task.due_date && (
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0 ${getUrgencyClass(task.due_date)}`}>
                          {formatShortDate(task.due_date)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </DashSection>
          )}
        </div>

        {/* Column 3: Fitness + Goals + Notepad + Activity */}
        <div className="space-y-6">
          {/* Fitness Performance */}
          {data.fitnessEnabled && (
            <DashSection icon={<Dumbbell className="w-4 h-4 text-emerald-500" />} title="Fitness">
              <div className="grid grid-cols-2 gap-3">
                <MiniStat icon={<CalendarDays className="w-3.5 h-3.5" />} label="Daily Avg" value={data.fitnessStats.averageCompletionsPerDay.toFixed(1)} />
                <MiniStat icon={<Flame className="w-3.5 h-3.5" />} label="Total" value={String(data.fitnessStats.totalCompletions)} />
                {data.fitnessStats.mostCompletedTask && (
                  <div className="col-span-2 flex items-center gap-2 text-sm">
                    <Trophy className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                    <span className="truncate text-muted-foreground">
                      Top: <span className="text-foreground font-medium">{data.fitnessStats.mostCompletedTask.title}</span>
                      <span className="text-muted-foreground"> ({data.fitnessStats.mostCompletedTask.count})</span>
                    </span>
                  </div>
                )}
                {data.fitnessStats.leastCompletedTask && (
                  <div className="col-span-2 flex items-center gap-2 text-sm">
                    <TrendingDown className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                    <span className="truncate text-muted-foreground">
                      Needs work: <span className="text-foreground font-medium">{data.fitnessStats.leastCompletedTask.title}</span>
                      <span className="text-muted-foreground"> ({data.fitnessStats.leastCompletedTask.count})</span>
                    </span>
                  </div>
                )}
              </div>
            </DashSection>
          )}

          {/* Northstar Goals */}
          {data.northstarEnabled && data.northstarGoals.length > 0 && (
            <DashSection icon={<Compass className="w-4 h-4 text-indigo-500" />} title="Goals">
              <div className="space-y-2">
                {data.northstarGoals.slice(0, 5).map((goal) => (
                  <div key={goal.id} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="truncate font-medium">{goal.title}</span>
                      <span className="text-xs text-muted-foreground tabular-nums flex-shrink-0 ml-2">{goal.progress}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-indigo-500 transition-all"
                        style={{ width: `${Math.min(goal.progress, 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </DashSection>
          )}

          {/* Notepad */}
          {data.notepadEnabled && data.notepadContent && (
            <DashSection icon={<StickyNote className="w-4 h-4 text-amber-500" />} title="Notepad">
              <div className="text-sm text-foreground/80 whitespace-pre-wrap font-mono leading-relaxed max-h-[200px] overflow-y-auto">
                {data.notepadContent}
              </div>
            </DashSection>
          )}

          {/* Activity Stream */}
          {data.recentActivity.length > 0 && (
            <DashSection icon={<Clock className="w-4 h-4 text-muted-foreground" />} title="Recent Activity">
              <div className="space-y-0.5">
                {data.recentActivity.map((item) => (
                  <div key={item.id} className="flex items-center gap-2 py-1.5 px-1 text-sm">
                    <ActivityIcon type={item.type} />
                    <span className="flex-1 truncate text-foreground/80">{item.description}</span>
                    <span className="text-[10px] text-muted-foreground flex-shrink-0">{relativeTime(item.timestamp)}</span>
                  </div>
                ))}
              </div>
            </DashSection>
          )}
        </div>
      </div>

      {/* ── Bottom: Recent Wins ────────────────────────────────────── */}
      {data.tasksEnabled && data.recentWins.length > 0 && (
        <DashSection icon={<CheckCircle2 className="w-4 h-4 text-emerald-500" />} title={`Recently Completed (${data.completedTasks.length})`}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {data.recentWins.map((task) => (
              <div key={task.id} className="flex items-center gap-2 rounded-md border border-border/30 bg-card px-3 py-2 hover:bg-accent/20 transition-colors">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                <span className="text-sm truncate">{task.title}</span>
              </div>
            ))}
          </div>
        </DashSection>
      )}

      {/* Loading indicator */}
      {data.isDataLoading && (
        <div className="fixed bottom-4 right-4 bg-card border border-border/50 rounded-full px-3 py-1.5 shadow-sm flex items-center gap-2 text-xs text-muted-foreground z-50">
          <Loader2 className="w-3 h-3 animate-spin" />
          Refreshing...
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function DashSection({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
      </div>
      <div className="rounded-lg border border-border/40 bg-card/50 p-3">
        {children}
      </div>
    </section>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="py-6 text-center">
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  )
}

function StatCard({ icon, label, value, sub, accent }: {
  icon: React.ReactNode
  label: string
  value: number
  sub?: string
  accent: 'blue' | 'red' | 'orange' | 'emerald' | 'amber' | 'indigo' | 'purple' | 'muted'
}) {
  const accentMap: Record<string, string> = {
    blue: 'text-blue-600 dark:text-blue-400',
    red: 'text-red-600 dark:text-red-400',
    orange: 'text-orange-600 dark:text-orange-400',
    emerald: 'text-emerald-600 dark:text-emerald-400',
    amber: 'text-amber-600 dark:text-amber-400',
    indigo: 'text-indigo-600 dark:text-indigo-400',
    purple: 'text-purple-600 dark:text-purple-400',
    muted: 'text-muted-foreground',
  }

  return (
    <div className="rounded-lg border border-border/40 bg-card p-3 space-y-1">
      <div className="flex items-center gap-1.5">
        <span className={accentMap[accent]}>{icon}</span>
        <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      </div>
      <div className={`text-xl font-bold tabular-nums ${accentMap[accent]}`}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  )
}

function MiniStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground">{icon}</span>
      <div>
        <div className="text-lg font-bold tabular-nums">{value}</div>
        <div className="text-[10px] text-muted-foreground">{label}</div>
      </div>
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
