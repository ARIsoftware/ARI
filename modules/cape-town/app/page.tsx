/**
 * Cape Town Module - Main Page
 *
 * Task and packing list tracker with two sections:
 * - Todo: General tasks
 * - Packing List: Items to pack
 *
 * Route: /cape-town
 */

'use client'

import { useEffect, useState } from 'react'
import { useSupabase } from '@/components/providers'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import type { CapeTownTask } from '../types'

type Category = 'todo' | 'packing_list'

interface TaskSectionProps {
  title: string
  category: Category
  tasks: CapeTownTask[]
  newTaskValue: string
  onNewTaskChange: (value: string) => void
  onAddTask: (e: React.FormEvent) => void
  onToggleTask: (id: string, completed: boolean) => void
  onDeleteTask: (id: string) => void
  submitting: boolean
}

function TaskSection({
  title,
  category,
  tasks,
  newTaskValue,
  onNewTaskChange,
  onAddTask,
  onToggleTask,
  onDeleteTask,
  submitting
}: TaskSectionProps) {
  const categoryTasks = tasks.filter(t => t.category === category)
  const completedCount = categoryTasks.filter(t => t.completed).length
  const totalCount = categoryTasks.length

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl font-semibold">{title}</CardTitle>
          <span className="text-sm text-muted-foreground">
            {completedCount}/{totalCount} completed
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add task form */}
        <form onSubmit={onAddTask} className="flex gap-2">
          <Input
            value={newTaskValue}
            onChange={(e) => onNewTaskChange(e.target.value)}
            placeholder={category === 'todo' ? 'Add a new task...' : 'Add a packing item...'}
            disabled={submitting}
            className="flex-1"
          />
          <Button
            type="submit"
            disabled={submitting || !newTaskValue.trim()}
            size="icon"
            className="shrink-0"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
          </Button>
        </form>

        {/* Task list */}
        <div className="space-y-2">
          {categoryTasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors"
            >
              <Checkbox
                id={task.id}
                checked={task.completed}
                onCheckedChange={(checked) => onToggleTask(task.id, checked as boolean)}
                className="shrink-0"
              />
              <label
                htmlFor={task.id}
                className={`flex-1 cursor-pointer ${
                  task.completed ? 'line-through text-muted-foreground' : ''
                }`}
              >
                {task.title}
              </label>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onDeleteTask(task.id)}
                className="shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
          {categoryTasks.length === 0 && (
            <p className="text-center text-muted-foreground py-4">
              No items yet
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export default function CapeTownPage() {
  const { session } = useSupabase()

  const [tasks, setTasks] = useState<CapeTownTask[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Separate state for each section's input
  const [newTodoTask, setNewTodoTask] = useState('')
  const [newPackingTask, setNewPackingTask] = useState('')
  const [submittingTodo, setSubmittingTodo] = useState(false)
  const [submittingPacking, setSubmittingPacking] = useState(false)

  useEffect(() => {
    if (session?.access_token) {
      loadTasks()
    }
  }, [session])

  const loadTasks = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch('/api/modules/cape-town/tasks', {
        headers: {
          'Authorization': `Bearer ${session?.access_token}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to load tasks')
      }

      const data = await response.json()
      setTasks(data.tasks || [])
    } catch (err) {
      console.error('Error loading tasks:', err)
      setError('Failed to load tasks. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleAddTask = async (category: Category, title: string) => {
    if (!title.trim()) return

    const setSubmitting = category === 'todo' ? setSubmittingTodo : setSubmittingPacking
    const setNewTask = category === 'todo' ? setNewTodoTask : setNewPackingTask

    try {
      setSubmitting(true)
      setError(null)

      const response = await fetch('/api/modules/cape-town/tasks', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ title, category })
      })

      if (!response.ok) {
        throw new Error('Failed to create task')
      }

      const data = await response.json()

      // Add new task to state (optimistic-style update from response)
      if (data.task) {
        setTasks(prevTasks => [...prevTasks, data.task])
      }

      setNewTask('')
    } catch (err) {
      console.error('Error creating task:', err)
      setError('Failed to create task. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleToggleTask = async (id: string, completed: boolean) => {
    try {
      // Optimistic update
      setTasks(tasks.map(t => t.id === id ? { ...t, completed } : t))

      const response = await fetch(`/api/modules/cape-town/tasks?id=${id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ completed })
      })

      if (!response.ok) {
        throw new Error('Failed to update task')
        // Revert on error
        setTasks(tasks.map(t => t.id === id ? { ...t, completed: !completed } : t))
      }
    } catch (err) {
      console.error('Error updating task:', err)
      // Reload to get correct state
      await loadTasks()
    }
  }

  const handleDeleteTask = async (id: string) => {
    try {
      // Optimistic update
      setTasks(tasks.filter(t => t.id !== id))

      const response = await fetch(`/api/modules/cape-town/tasks?id=${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to delete task')
        await loadTasks()
      }
    } catch (err) {
      console.error('Error deleting task:', err)
      await loadTasks()
    }
  }

  if (!session || loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex items-center gap-2">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span>Loading...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-4xl font-medium">Cape Town</h1>
        <p className="text-muted-foreground mt-1">Trip planning and packing list</p>
      </div>

      {/* Error Display */}
      {error && (
        <Card className="border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800">
          <CardContent className="pt-6">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Task Sections */}
      <div className="grid gap-6 md:grid-cols-2">
        <TaskSection
          title="Todo"
          category="todo"
          tasks={tasks}
          newTaskValue={newTodoTask}
          onNewTaskChange={setNewTodoTask}
          onAddTask={(e) => {
            e.preventDefault()
            handleAddTask('todo', newTodoTask)
          }}
          onToggleTask={handleToggleTask}
          onDeleteTask={handleDeleteTask}
          submitting={submittingTodo}
        />

        <TaskSection
          title="Packing List"
          category="packing_list"
          tasks={tasks}
          newTaskValue={newPackingTask}
          onNewTaskChange={setNewPackingTask}
          onAddTask={(e) => {
            e.preventDefault()
            handleAddTask('packing_list', newPackingTask)
          }}
          onToggleTask={handleToggleTask}
          onDeleteTask={handleDeleteTask}
          submitting={submittingPacking}
        />
      </div>
    </div>
  )
}
