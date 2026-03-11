"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Loader2, CheckSquare, Circle, AlertCircle, Clock, Target, Dumbbell, Trophy, Compass, Check, Pin } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { HDContributionGraph } from "../components/hd-contribution-graph"
import { HDCardZoomModal } from "../components/hd-card-zoom-modal"
import { useHDDashboardData, useToggleWinterArcGoal } from "@/lib/hooks/use-hd-dashboard"
import type { WinterArcGoal } from "@/modules/winter-arc/lib/winter-arc-goals"

interface Task {
  id: string
  title: string
  status: string
  priority_score?: number
  due_date?: string
  impact?: number
  severity?: number
  timeliness?: number
  effort?: number
  strategic_fit?: number
  pinned?: boolean
  completed: boolean
}

export default function HDDashboardPage() {
  const { toast } = useToast()
  const {
    enabledModules,
    tasks,
    notepadContent,
    fitnessStats,
    winterArcGoals,
    isLoading,
  } = useHDDashboardData()

  const toggleGoalMutation = useToggleWinterArcGoal()
  const [zoomedCard, setZoomedCard] = useState<string | null>(null)

  const handleToggleWinterArcGoal = async (goal: WinterArcGoal) => {
    try {
      await toggleGoalMutation.mutateAsync({ id: goal.id, completed: !goal.completed })
    } catch (error: unknown) {
      console.error('Error toggling goal:', error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to toggle goal",
        variant: "destructive",
      })
    }
  }

  // Calculate task statistics
  const incompleteTasks = tasks.filter((t: Task) => !t.completed && t.status !== 'Completed')
  const completedTasks = tasks.filter((t: Task) => t.completed || t.status === 'Completed')
  const overdueTasks = incompleteTasks.filter((t: Task) => t.due_date && new Date(t.due_date) < new Date())
  const todayTasks = incompleteTasks.filter((t: Task) => {
    if (!t.due_date) return false
    const today = new Date().toDateString()
    return new Date(t.due_date).toDateString() === today
  })
  const highPriorityTasks = incompleteTasks
    .filter((t: Task) => t.priority_score && t.priority_score > 0)
    .sort((a: Task, b: Task) => (a.priority_score || 0) - (b.priority_score || 0))
    .slice(0, 15)
  const pinnedTasks = incompleteTasks.filter((t: Task) => t.pinned)

  const getUrgencyColor = (task: Task) => {
    if (!task.due_date) return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 blueprint:bg-[#093daf] blueprint:text-white light:bg-gray-100 light:text-gray-600'
    const daysUntil = Math.ceil((new Date(task.due_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
    if (daysUntil < 0) return 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 blueprint:bg-[#093daf] blueprint:text-white light:bg-red-100 light:text-red-700'
    if (daysUntil <= 1) return 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300 blueprint:bg-[#093daf] blueprint:text-white light:bg-orange-100 light:text-orange-700'
    if (daysUntil <= 3) return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300 blueprint:bg-[#093daf] blueprint:text-white light:bg-yellow-100 light:text-yellow-700'
    return 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 blueprint:bg-[#093daf] blueprint:text-white light:bg-green-100 light:text-green-700'
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  return (
    <>
      {/* Loading overlay - doesn't block rendering */}
      {isLoading && (
        <div className="absolute inset-0 bg-white/50 dark:bg-gray-900/50 blueprint:bg-[#056baa]/50 flex items-center justify-center z-50">
          <div className="flex items-center gap-2">
            <Loader2 className="w-6 h-6 animate-spin dark:text-white blueprint:text-white" />
            <span className="text-xs dark:text-white blueprint:text-white">Loading HD Dashboard...</span>
          </div>
        </div>
      )}

      <div className="p-2 dark:bg-gray-900 blueprint:bg-[#056baa] min-h-screen">
        {/* Winter Arc Goals - Only show if module is enabled */}
        {enabledModules.has('winter-arc') && (
          <div className="mb-2">
            {winterArcGoals.length === 0 ? (
              <div className="border dark:border-gray-700 blueprint:border-white light:border-gray-200 rounded p-4 bg-gray-50 dark:bg-gray-800 text-center">
                <p className="text-sm text-gray-600 dark:text-gray-400">No Winter Arc goals yet. Create some at <a href="/winter-arc" className="underline">/winter-arc</a></p>
              </div>
            ) : (
              <div className="grid grid-cols-6 gap-2">
                {winterArcGoals.map((goal, index) => {
                const pastelColors = [
                  'bg-blue-50 dark:bg-blue-900/20 blueprint:bg-transparent light:bg-transparent hover:bg-blue-100 dark:hover:bg-blue-900/30 blueprint:hover:bg-white/10 light:hover:bg-gray-50',
                  'bg-purple-50 dark:bg-purple-900/20 blueprint:bg-transparent light:bg-transparent hover:bg-purple-100 dark:hover:bg-purple-900/30 blueprint:hover:bg-white/10 light:hover:bg-gray-50',
                  'bg-green-50 dark:bg-green-900/20 blueprint:bg-transparent light:bg-transparent hover:bg-green-100 dark:hover:bg-green-900/30 blueprint:hover:bg-white/10 light:hover:bg-gray-50',
                  'bg-orange-50 dark:bg-orange-900/20 blueprint:bg-transparent light:bg-transparent hover:bg-orange-100 dark:hover:bg-orange-900/30 blueprint:hover:bg-white/10 light:hover:bg-gray-50',
                  'bg-pink-50 dark:bg-pink-900/20 blueprint:bg-transparent light:bg-transparent hover:bg-pink-100 dark:hover:bg-pink-900/30 blueprint:hover:bg-white/10 light:hover:bg-pink-50'
                ];
                return (
                  <button
                    key={goal.id}
                    onClick={() => handleToggleWinterArcGoal(goal)}
                    className={`relative border dark:border-gray-700 blueprint:border-white light:border-gray-200 rounded p-4 text-center transition-all ${pastelColors[index % 5]}`}
                    style={{
                      opacity: goal.completed ? 0.3 : 1,
                    }}
                  >
                    <div className="text-sm font-semibold uppercase tracking-wide break-words dark:text-white blueprint:text-white light:text-gray-900">
                      {goal.title}
                    </div>
                    {goal.completed && (
                      <div className="absolute top-2 right-2 bg-green-500 rounded-full p-2">
                        <Check className="h-6 w-6 text-white" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            )}
          </div>
        )}

        {/* Contribution Graphs - Only show if winter-arc module is enabled */}
        {enabledModules.has('winter-arc') && winterArcGoals.length > 0 && (
          <div className="mb-2">
            <HDContributionGraph goals={winterArcGoals} />
          </div>
        )}

        {/* Top Stats Row - Ultra Compact */}
        <div className="grid grid-cols-6 gap-1 mb-2">
          <div className="border dark:border-gray-700 blueprint:border-white light:border-gray-200 rounded p-1.5 bg-blue-50 dark:bg-blue-900/20 blueprint:bg-transparent light:bg-transparent">
            <div className="flex items-center gap-1">
              <CheckSquare className="w-3 h-3 text-blue-600 dark:text-blue-400 blueprint:text-white light:text-blue-600" />
              <span className="text-[10px] font-medium text-gray-600 dark:text-gray-300 blueprint:text-white light:text-gray-600">Tasks</span>
            </div>
            <div className="text-lg font-bold text-blue-900 dark:text-blue-300 blueprint:text-white light:text-blue-900">{tasks.length}</div>
            <div className="text-[9px] text-gray-500 dark:text-gray-400 blueprint:text-white light:text-gray-500">{completedTasks.length} done</div>
          </div>

          <div className="border dark:border-gray-700 blueprint:border-white light:border-gray-200 rounded p-1.5 bg-red-50 dark:bg-red-900/20 blueprint:bg-transparent light:bg-transparent">
            <div className="flex items-center gap-1">
              <AlertCircle className="w-3 h-3 text-red-600 dark:text-red-400 blueprint:text-white light:text-red-600" />
              <span className="text-[10px] font-medium text-gray-600 dark:text-gray-300 blueprint:text-white light:text-gray-600">Overdue</span>
            </div>
            <div className="text-lg font-bold text-red-900 dark:text-red-300 blueprint:text-white light:text-red-900">{overdueTasks.length}</div>
            <div className="text-[9px] text-gray-500 dark:text-gray-400 blueprint:text-white light:text-gray-500">needs attention</div>
          </div>

          <div className="border dark:border-gray-700 blueprint:border-white light:border-gray-200 rounded p-1.5 bg-orange-50 dark:bg-orange-900/20 blueprint:bg-transparent light:bg-transparent">
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3 text-orange-600 dark:text-orange-400 blueprint:text-white light:text-orange-600" />
              <span className="text-[10px] font-medium text-gray-600 dark:text-gray-300 blueprint:text-white light:text-gray-600">Today</span>
            </div>
            <div className="text-lg font-bold text-orange-900 dark:text-orange-300 blueprint:text-white light:text-orange-900">{todayTasks.length}</div>
            <div className="text-[9px] text-gray-500 dark:text-gray-400 blueprint:text-white light:text-gray-500">due today</div>
          </div>

          {/* Fitness card - Only show if daily-fitness module is enabled */}
          {enabledModules.has('daily-fitness') && (
            <div className="border dark:border-gray-700 blueprint:border-white light:border-gray-200 rounded p-1.5 bg-green-50 dark:bg-green-900/20 blueprint:bg-transparent light:bg-transparent">
              <div className="flex items-center gap-1">
                <Trophy className="w-3 h-3 text-green-600 dark:text-green-400 blueprint:text-white light:text-green-600" />
                <span className="text-[10px] font-medium text-gray-600 dark:text-gray-300 blueprint:text-white light:text-gray-600">Fitness</span>
              </div>
              <div className="text-lg font-bold text-green-900 dark:text-green-300 blueprint:text-white light:text-green-900">{fitnessStats.totalCompletions}</div>
              <div className="text-[9px] text-gray-500 dark:text-gray-400 blueprint:text-white light:text-gray-500">completions</div>
            </div>
          )}

          {/* Avg/Day card - Only show if daily-fitness module is enabled */}
          {enabledModules.has('daily-fitness') && (
            <div className="border dark:border-gray-700 blueprint:border-white light:border-gray-200 rounded p-1.5 bg-yellow-50 dark:bg-yellow-900/20 blueprint:bg-transparent light:bg-transparent">
              <div className="flex items-center gap-1">
                <Dumbbell className="w-3 h-3 text-yellow-600 dark:text-yellow-400 blueprint:text-white light:text-yellow-600" />
                <span className="text-[10px] font-medium text-gray-600 dark:text-gray-300 blueprint:text-white light:text-gray-600">Avg/Day</span>
              </div>
              <div className="text-lg font-bold text-yellow-900 dark:text-yellow-300 blueprint:text-white light:text-yellow-900">{fitnessStats.averageCompletionsPerDay.toFixed(1)}</div>
              <div className="text-[9px] text-gray-500 dark:text-gray-400 blueprint:text-white light:text-gray-500">fitness avg</div>
            </div>
          )}

          <div className="border dark:border-gray-700 blueprint:border-white light:border-gray-200 rounded p-1.5 bg-indigo-50 dark:bg-indigo-900/20 blueprint:bg-transparent light:bg-transparent">
            <div className="flex items-center gap-1">
              <Target className="w-3 h-3 text-indigo-600 dark:text-indigo-400 blueprint:text-white light:text-indigo-600" />
              <span className="text-[10px] font-medium text-gray-600 dark:text-gray-300 blueprint:text-white light:text-gray-600">Active</span>
            </div>
            <div className="text-lg font-bold text-indigo-900 dark:text-indigo-300 blueprint:text-white light:text-indigo-900">{incompleteTasks.length}</div>
            <div className="text-[9px] text-gray-500 dark:text-gray-400 blueprint:text-white light:text-gray-500">incomplete</div>
          </div>

        </div>

        {/* Main Content Grid - 3 Columns */}
        <div className="grid grid-cols-3 gap-2 items-start" style={{ minHeight: 'calc(100vh - 400px)' }}>
          {/* Column 1: Pinned Tasks + All Active Tasks */}
          <div className="space-y-2">
            {/* Pinned Tasks Card */}
            {pinnedTasks.length > 0 && (
              <div
                onClick={() => setZoomedCard('pinned')}
                className="border dark:border-gray-700 blueprint:border-white light:border-gray-200 rounded p-2 bg-blue-50 dark:bg-blue-900/20 blueprint:bg-transparent light:bg-transparent cursor-pointer hover:shadow-lg transition-shadow"
              >
                <h3 className="text-xs font-bold mb-1.5 flex items-center gap-1 text-blue-900 dark:text-blue-300 blueprint:text-white light:text-blue-900">
                  <Pin className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 blueprint:text-white light:text-blue-600" />
                  Pinned Tasks ({pinnedTasks.length})
                </h3>
                <div className="space-y-0.5 max-h-[300px] overflow-y-auto">
                  {pinnedTasks.map((task) => (
                    <div key={task.id} className="flex items-center gap-1.5 py-0.5 px-1 bg-white dark:bg-gray-800 blueprint:bg-transparent light:bg-white rounded text-[11px]">
                      <Pin className="w-2.5 h-2.5 flex-shrink-0 text-blue-600 dark:text-blue-400 blueprint:text-white light:text-blue-600" />
                      <div className="flex-1 min-w-0 truncate dark:text-gray-100 blueprint:text-white light:text-gray-900">{task.title}</div>
                      {task.due_date && (
                        <Badge className={`text-[8px] px-1 py-0 h-3.5 ${getUrgencyColor(task)}`}>
                          {formatDate(task.due_date)}
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Active Tasks Card */}
            <div
              onClick={() => setZoomedCard('active')}
              className="border dark:border-gray-700 blueprint:border-white light:border-gray-200 rounded p-2 bg-gray-50 dark:bg-gray-800/50 blueprint:bg-transparent light:bg-transparent cursor-pointer hover:shadow-lg transition-shadow"
            >
              <h3 className="text-xs font-bold mb-1.5 flex items-center gap-1 text-gray-900 dark:text-gray-100 blueprint:text-white light:text-gray-900">
                <CheckSquare className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 blueprint:text-white light:text-blue-600" />
                Active Tasks ({incompleteTasks.length})
              </h3>
              <div className="space-y-0.5 max-h-[600px] overflow-y-auto">
                {incompleteTasks.map((task) => (
                  <div key={task.id} className="flex items-center gap-1.5 py-0.5 px-1 bg-white dark:bg-gray-800 blueprint:bg-transparent light:bg-white rounded text-[11px]">
                    <Circle className="w-2.5 h-2.5 flex-shrink-0 text-blue-600 dark:text-blue-400 blueprint:text-white light:text-blue-600" />
                    <div className="flex-1 min-w-0 truncate dark:text-gray-100 blueprint:text-white light:text-gray-900">{task.title}</div>
                    {task.due_date && (
                      <Badge className={`text-[8px] px-1 py-0 h-3.5 ${getUrgencyColor(task)}`}>
                        {formatDate(task.due_date)}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Column 2: Overdue + Priority Tasks */}
          <div className="space-y-2">
            {/* Overdue Tasks */}
            {overdueTasks.length > 0 && (
              <div
                onClick={() => setZoomedCard('overdue')}
                className="border dark:border-gray-700 blueprint:border-white light:border-gray-200 rounded p-2 bg-red-50 dark:bg-red-900/20 blueprint:bg-transparent light:bg-transparent cursor-pointer hover:shadow-lg transition-shadow"
              >
                <h3 className="text-xs font-bold mb-1.5 flex items-center gap-1 text-red-900 dark:text-red-300 blueprint:text-white light:text-red-900">
                  <AlertCircle className="w-3.5 h-3.5 text-red-600 dark:text-red-400 blueprint:text-white light:text-red-600" />
                  Overdue ({overdueTasks.length})
                </h3>
                <div className="space-y-0.5">
                  {overdueTasks.slice(0, 8).map((task) => (
                    <div key={task.id} className="flex items-center gap-1.5 py-0.5 px-1 bg-white dark:bg-gray-800 blueprint:bg-transparent light:bg-white rounded text-[11px]">
                      <Circle className="w-2.5 h-2.5 flex-shrink-0 text-red-600 dark:text-red-400 blueprint:text-white light:text-red-600" />
                      <div className="flex-1 min-w-0 truncate font-medium dark:text-gray-100 blueprint:text-white light:text-gray-900">{task.title}</div>
                      {task.due_date && (
                        <span className="text-[9px] text-red-600 dark:text-red-400 blueprint:text-white light:text-red-600 flex-shrink-0">
                          {formatDate(task.due_date)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Priority Tasks */}
            <div
              onClick={() => setZoomedCard('priority')}
              className="border dark:border-gray-700 blueprint:border-white light:border-gray-200 rounded p-2 bg-orange-50 dark:bg-orange-900/20 blueprint:bg-transparent light:bg-transparent cursor-pointer hover:shadow-lg transition-shadow"
            >
              <h3 className="text-xs font-bold mb-1.5 flex items-center gap-1 text-orange-900 dark:text-orange-300 blueprint:text-white light:text-orange-900">
                <Target className="w-3.5 h-3.5 text-red-600 dark:text-red-400 blueprint:text-white light:text-red-600" />
                Top Priority Tasks ({highPriorityTasks.length})
              </h3>
              <div className="space-y-0.5 max-h-[500px] overflow-y-auto">
                {highPriorityTasks.map((task, idx) => (
                  <div key={task.id} className="flex items-start gap-1.5 py-0.5 px-1 bg-white dark:bg-gray-800 blueprint:bg-transparent light:bg-white rounded text-[11px]">
                    <span className="text-[9px] text-gray-400 dark:text-gray-500 blueprint:text-white light:text-gray-400 font-mono mt-0.5">{idx + 1}</span>
                    <Circle className="w-2.5 h-2.5 mt-0.5 flex-shrink-0 text-gray-400 dark:text-gray-500 blueprint:text-white light:text-gray-400" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 dark:text-gray-100 blueprint:text-white light:text-gray-900 truncate">{task.title}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {task.due_date && (
                          <Badge className={`text-[8px] px-1 py-0 h-3.5 ${getUrgencyColor(task)}`}>
                            {formatDate(task.due_date)}
                          </Badge>
                        )}
                        {task.priority_score != null && (
                          <span className="text-[9px] text-gray-500 dark:text-gray-400 blueprint:text-white light:text-gray-500 font-mono">
                            P:{Number(task.priority_score).toFixed(1)}
                          </span>
                        )}
                        {task.impact && (
                          <span className="text-[9px] text-blue-600 dark:text-blue-400 blueprint:text-white light:text-blue-600">I:{task.impact}</span>
                        )}
                        {task.severity && (
                          <span className="text-[9px] text-red-600 dark:text-red-400 blueprint:text-white light:text-red-600">S:{task.severity}</span>
                        )}
                        {task.effort && (
                          <span className="text-[9px] text-purple-600 dark:text-purple-400 blueprint:text-white light:text-purple-600">E:{task.effort}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {highPriorityTasks.length === 0 && (
                  <div className="text-[10px] text-gray-400 dark:text-gray-500 blueprint:text-white light:text-gray-400 text-center py-4">No priority tasks</div>
                )}
              </div>
            </div>
          </div>

          {/* Column 3: Notepad */}
          <div className="min-w-[500px] flex flex-col h-full">
            {/* Notepad */}
            <div
              onClick={() => setZoomedCard('notepad')}
              className="border dark:border-gray-700 blueprint:border-white light:border-gray-200 rounded p-2 bg-yellow-50 dark:bg-yellow-900/20 blueprint:bg-transparent light:bg-transparent flex flex-col flex-1 h-full cursor-pointer hover:shadow-lg transition-shadow"
            >
              <h3 className="text-xs font-bold mb-1.5 flex items-center gap-1 text-yellow-900 dark:text-yellow-300 blueprint:text-white light:text-yellow-900">
                <Compass className="w-3.5 h-3.5 text-yellow-600 dark:text-yellow-400 blueprint:text-white light:text-yellow-600" />
                Notepad
              </h3>
              <div className="bg-white dark:bg-gray-800 blueprint:bg-transparent light:bg-white rounded p-2 text-[10px] text-gray-700 dark:text-gray-300 blueprint:text-white light:text-gray-700 overflow-y-auto whitespace-pre-wrap font-mono leading-tight flex-1">
                {notepadContent || "No notes yet"}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Section: Recently Completed Tasks */}
        {completedTasks.length > 0 && (
          <div className="border dark:border-gray-700 blueprint:border-white light:border-gray-200 rounded p-2 mt-2 bg-gray-50 dark:bg-gray-800 blueprint:bg-transparent light:bg-transparent">
            <h3 className="text-xs font-bold mb-1.5 flex items-center gap-1 text-gray-900 dark:text-gray-100 blueprint:text-white light:text-gray-900">
              <CheckSquare className="w-3.5 h-3.5 text-gray-600 dark:text-gray-400 blueprint:text-white light:text-gray-600" />
              Recently Completed ({completedTasks.length})
            </h3>
            <div className="grid grid-cols-4 gap-1">
              {completedTasks.slice(0, 16).map((task) => (
                <div key={task.id} className="bg-white dark:bg-gray-700 blueprint:bg-transparent light:bg-white rounded px-2 py-1 text-[10px] text-gray-500 dark:text-gray-300 blueprint:text-white light:text-gray-500 truncate border dark:border-gray-600 blueprint:border-white/20 light:border-gray-200">
                  <CheckSquare className="w-2.5 h-2.5 inline mr-1 text-green-600 dark:text-green-400 blueprint:text-white light:text-green-600" />
                  {task.title}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Zoom Modal */}
      <HDCardZoomModal
        isOpen={zoomedCard !== null}
        onClose={() => setZoomedCard(null)}
        title={
          zoomedCard === 'pinned' ? `Pinned Tasks (${pinnedTasks.length})` :
          zoomedCard === 'active' ? `Active Tasks (${incompleteTasks.length})` :
          zoomedCard === 'overdue' ? `Overdue Tasks (${overdueTasks.length})` :
          zoomedCard === 'priority' ? `Top Priority Tasks (${highPriorityTasks.length})` :
          zoomedCard === 'notepad' ? 'Notepad' : ''
        }
        cardType={zoomedCard as 'pinned' | 'active' | 'overdue' | 'priority' | 'notepad'}
        tasks={
          zoomedCard === 'pinned' ? pinnedTasks :
          zoomedCard === 'active' ? incompleteTasks :
          zoomedCard === 'overdue' ? overdueTasks :
          zoomedCard === 'priority' ? highPriorityTasks : []
        }
        notepadContent={zoomedCard === 'notepad' ? notepadContent : ''}
      />
    </>
  )
}
