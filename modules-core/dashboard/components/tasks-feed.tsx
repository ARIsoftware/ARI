'use client'

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CheckSquare, Eye, ListTodo, Loader2 } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'

const MAX_TASKS = 20

// Minimal local shape of /api/modules/tasks rows — the dashboard stays
// self-contained and doesn't import types from the tasks module.
interface TaskItem {
  id: string
  title: string
  status: 'Pending' | 'In Progress' | 'Completed'
  priority: 'Low' | 'Medium' | 'High'
  completed: boolean
  due_date: string | null
}

interface TasksFeedProps {
  enabled: boolean
}

function safeFormatDueDate(dueDate: string | null): string | null {
  if (!dueDate) return null
  try {
    const date = new Date(dueDate)
    if (isNaN(date.getTime())) return null
    return format(date, 'MMM d')
  } catch {
    return null
  }
}

function getPriorityColor(priority: TaskItem['priority']) {
  switch (priority) {
    case 'High':
      return 'text-red-600'
    case 'Medium':
      return 'text-amber-600'
    default:
      return 'text-muted-foreground'
  }
}

function ViewAllButton() {
  return (
    <Button
      variant="ghost"
      className="w-full mt-4 rounded-full bg-[#f7fafc] text-black hover:bg-[#eef2f7] hover:text-black"
      onClick={() => (window.location.href = '/tasks')}
    >
      <Eye className="w-4 h-4 mr-2" />
      View All
    </Button>
  )
}

export function TasksFeed({ enabled }: TasksFeedProps) {
  const router = useRouter()

  // Shares the tasks module's ['tasks'] cache: task mutations anywhere in the
  // app invalidate this list, so the feed stays fresh without its own polling.
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: async (): Promise<TaskItem[]> => {
      const res = await fetch('/api/modules/tasks')
      if (!res.ok) return []
      return res.json()
    },
    enabled,
  })

  const visibleTasks = tasks.slice(0, MAX_TASKS)

  if (!isLoading && visibleTasks.length === 0) {
    return (
      <Card className="flex h-full flex-col rounded-none border-0 shadow-none">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckSquare className="w-5 h-5 text-blue-600" />
            Tasks
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col">
          <div className="flex items-center justify-center flex-1">
            <div className="text-center">
              <ListTodo className="w-12 h-12 mx-auto text-muted-foreground mb-2" />
              <p className="text-muted-foreground">No tasks yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Create a task to see it here
              </p>
            </div>
          </div>
          <ViewAllButton />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="h-full rounded-none border-0 shadow-none">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CheckSquare className="w-5 h-5 text-blue-600" />
          Tasks
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="space-y-4">
              {visibleTasks.map((task) => {
                const dueDate = safeFormatDueDate(task.due_date)
                return (
                  <button
                    key={task.id}
                    type="button"
                    className="w-full text-left p-3 rounded-lg bg-muted/50 hover:bg-muted/80 transition-colors cursor-pointer"
                    onClick={() => router.push(`/tasks/edit/${task.id}`)}
                  >
                    <p
                      className={`text-sm truncate ${
                        task.completed ? 'text-muted-foreground line-through' : ''
                      }`}
                    >
                      {task.title}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      <span className={getPriorityColor(task.priority)}>{task.priority}</span>
                      {dueDate && <span> · Due {dueDate}</span>}
                    </p>
                  </button>
                )
              })}
            </div>
            <ViewAllButton />
          </>
        )}
      </CardContent>
    </Card>
  )
}
