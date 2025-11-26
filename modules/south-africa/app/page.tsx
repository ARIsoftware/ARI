/**
 * South Africa Module - Main Page
 *
 * Task and packing list tracker with two sections:
 * - Todo: General tasks
 * - Packing List: Items to pack
 *
 * Route: /south-africa
 */

'use client'

import { useEffect, useState } from 'react'
import { useSupabase } from '@/components/providers'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Loader2, Plus, Trash2, X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { TravelTask, Activity } from '../types'
import SouthAfricaMap from './south-africa-map'
import ActivityList from './activity-list'

type Category = 'todo' | 'packing_list'

interface TaskSectionProps {
  title: string
  category: Category
  tasks: TravelTask[]
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

export default function SouthAfricaPage() {
  const { session } = useSupabase()

  const [tasks, setTasks] = useState<TravelTask[]>([])
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Separate state for each section's input
  const [newTodoTask, setNewTodoTask] = useState('')
  const [newPackingTask, setNewPackingTask] = useState('')
  const [submittingTodo, setSubmittingTodo] = useState(false)
  const [submittingPacking, setSubmittingPacking] = useState(false)

  // Activity Modal State (for add and edit)
  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false)
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null)
  const [activityForm, setActivityForm] = useState({
    title: '',
    start_date: '',
    end_date: '',
    address: '',
    activity_type: 'stay' as 'stay' | 'event',
    lat: '',
    lng: ''
  })
  const [submittingActivity, setSubmittingActivity] = useState(false)

  useEffect(() => {
    if (session?.access_token) {
      loadTasks()
      loadActivities()
    }
  }, [session])

  const loadTasks = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch('/api/modules/south-africa/tasks', {
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

  const loadActivities = async () => {
    try {
      const response = await fetch('/api/modules/south-africa/activities', {
        headers: {
          'Authorization': `Bearer ${session?.access_token}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to load activities')
      }

      const data = await response.json()
      setActivities(data.activities || [])
    } catch (err) {
      console.error('Error loading activities:', err)
    }
  }

  const handleAddTask = async (category: Category, title: string) => {
    if (!title.trim()) return

    const setSubmitting = category === 'todo' ? setSubmittingTodo : setSubmittingPacking
    const setNewTask = category === 'todo' ? setNewTodoTask : setNewPackingTask

    try {
      setSubmitting(true)
      setError(null)

      const response = await fetch('/api/modules/south-africa/tasks', {
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

      const response = await fetch(`/api/modules/south-africa/tasks?id=${id}`, {
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

      const response = await fetch(`/api/modules/south-africa/tasks?id=${id}`, {
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

  const openAddModal = () => {
    setEditingActivity(null)
    setActivityForm({
      title: '',
      start_date: '',
      end_date: '',
      address: '',
      activity_type: 'stay',
      lat: '',
      lng: ''
    })
    setIsActivityModalOpen(true)
  }

  const openEditModal = (activity: Activity) => {
    setEditingActivity(activity)
    setActivityForm({
      title: activity.title,
      start_date: activity.start_date,
      end_date: activity.end_date,
      address: activity.address,
      activity_type: activity.activity_type,
      lat: activity.lat?.toString() || '',
      lng: activity.lng?.toString() || ''
    })
    setIsActivityModalOpen(true)
  }

  const handleSubmitActivity = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!activityForm.title.trim() || !activityForm.start_date || !activityForm.end_date || !activityForm.address.trim()) {
      return
    }

    try {
      setSubmittingActivity(true)
      setError(null)

      const activityData: any = {
        title: activityForm.title,
        start_date: activityForm.start_date,
        end_date: activityForm.end_date,
        address: activityForm.address,
        activity_type: activityForm.activity_type
      }

      // Add lat/lng if provided
      if (activityForm.lat && activityForm.lng) {
        activityData.lat = parseFloat(activityForm.lat)
        activityData.lng = parseFloat(activityForm.lng)
      }

      if (editingActivity) {
        // Update existing activity
        const response = await fetch(`/api/modules/south-africa/activities?id=${editingActivity.id}`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${session?.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(activityData)
        })

        if (!response.ok) {
          throw new Error('Failed to update activity')
        }

        const data = await response.json()
        if (data.activity) {
          setActivities(prevActivities =>
            prevActivities.map(a => a.id === editingActivity.id ? data.activity : a)
          )
        }
      } else {
        // Create new activity
        const response = await fetch('/api/modules/south-africa/activities', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session?.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(activityData)
        })

        if (!response.ok) {
          throw new Error('Failed to create activity')
        }

        const data = await response.json()
        if (data.activity) {
          setActivities(prevActivities => [...prevActivities, data.activity])
        }
      }

      // Reset form and close modal
      setActivityForm({
        title: '',
        start_date: '',
        end_date: '',
        address: '',
        activity_type: 'stay',
        lat: '',
        lng: ''
      })
      setEditingActivity(null)
      setIsActivityModalOpen(false)
    } catch (err) {
      console.error('Error saving activity:', err)
      setError(editingActivity ? 'Failed to update activity. Please try again.' : 'Failed to create activity. Please try again.')
    } finally {
      setSubmittingActivity(false)
    }
  }

  const handleDeleteActivity = async (id: string) => {
    try {
      // Optimistic update
      setActivities(activities.filter(a => a.id !== id))

      const response = await fetch(`/api/modules/south-africa/activities?id=${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to delete activity')
        await loadActivities()
      }
    } catch (err) {
      console.error('Error deleting activity:', err)
      await loadActivities()
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
    <div className="flex flex-1">
      {/* Main Content */}
      <div className="flex-1 p-6 pr-3 space-y-6">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-medium">South Africa</h1>
            <p className="text-muted-foreground mt-1">2025 Family Adventure</p>
          </div>
          <Button onClick={openAddModal}>
            <Plus className="w-4 h-4 mr-2" />
            Add
          </Button>
        </div>

        {/* Map */}
        <SouthAfricaMap activities={activities} />

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

      {/* Right Sidebar - Activity List */}
      <div className="w-80 bg-white dark:bg-background p-6 pl-3 border-l">
        <ActivityList activities={activities} onEdit={openEditModal} onDelete={handleDeleteActivity} />
      </div>

      {/* Activity Modal (Add/Edit) */}
      <Dialog open={isActivityModalOpen} onOpenChange={setIsActivityModalOpen}>
        <DialogContent className="sm:max-w-[425px] z-[9999]">
          <DialogHeader>
            <DialogTitle>{editingActivity ? 'Edit Activity' : 'Add Activity'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmitActivity} className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={activityForm.title}
                onChange={(e) => setActivityForm({ ...activityForm, title: e.target.value })}
                placeholder="e.g., Hout Bay Airbnb"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="start_date">Start Date</Label>
                <Input
                  id="start_date"
                  type="date"
                  value={activityForm.start_date}
                  onChange={(e) => setActivityForm({ ...activityForm, start_date: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end_date">End Date</Label>
                <Input
                  id="end_date"
                  type="date"
                  value={activityForm.end_date}
                  onChange={(e) => setActivityForm({ ...activityForm, end_date: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                value={activityForm.address}
                onChange={(e) => setActivityForm({ ...activityForm, address: e.target.value })}
                placeholder="Full address"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="type">Type</Label>
              <Select
                value={activityForm.activity_type}
                onValueChange={(value: 'stay' | 'event') =>
                  setActivityForm({ ...activityForm, activity_type: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent className="z-[10000]">
                  <SelectItem value="stay">Stay (Accommodation)</SelectItem>
                  <SelectItem value="event">Event</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="lat">Latitude (optional)</Label>
                <Input
                  id="lat"
                  type="number"
                  step="0.000001"
                  min="-90"
                  max="90"
                  value={activityForm.lat}
                  onChange={(e) => setActivityForm({ ...activityForm, lat: e.target.value })}
                  placeholder="-33.9"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lng">Longitude (optional)</Label>
                <Input
                  id="lng"
                  type="number"
                  step="0.000001"
                  min="-180"
                  max="180"
                  value={activityForm.lng}
                  onChange={(e) => setActivityForm({ ...activityForm, lng: e.target.value })}
                  placeholder="18.4"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsActivityModalOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submittingActivity}>
                {submittingActivity ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Plus className="w-4 h-4 mr-2" />
                )}
                {editingActivity ? 'Save Changes' : 'Add Activity'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
