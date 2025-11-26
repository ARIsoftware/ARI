/**
 * South Africa Module - Client Component
 *
 * Handles all interactive functionality for the South Africa page.
 * Receives initial data from the server component.
 */

'use client'

import { useEffect, useState } from 'react'
import { useSupabase } from '@/components/providers'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Loader2, Plus, Trash2 } from 'lucide-react'
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
import FlightCards from './flight-cards'

type Category = 'todo' | 'packing_list'

interface SouthAfricaClientProps {
  initialTasks: TravelTask[]
  initialActivities: Activity[]
}

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

export default function SouthAfricaClient({ initialTasks, initialActivities }: SouthAfricaClientProps) {
  const { session } = useSupabase()

  const [tasks, setTasks] = useState<TravelTask[]>(initialTasks)
  const [activities, setActivities] = useState<Activity[]>(initialActivities)
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
        setTasks(tasks.map(t => t.id === id ? { ...t, completed: !completed } : t))
        throw new Error('Failed to update task')
      }
    } catch (err) {
      console.error('Error updating task:', err)
    }
  }

  const handleDeleteTask = async (id: string) => {
    const previousTasks = tasks
    try {
      setTasks(tasks.filter(t => t.id !== id))

      const response = await fetch(`/api/modules/south-africa/tasks?id=${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`
        }
      })

      if (!response.ok) {
        setTasks(previousTasks)
        throw new Error('Failed to delete task')
      }
    } catch (err) {
      console.error('Error deleting task:', err)
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

      if (activityForm.lat && activityForm.lng) {
        activityData.lat = parseFloat(activityForm.lat)
        activityData.lng = parseFloat(activityForm.lng)
      }

      if (editingActivity) {
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
    const previousActivities = activities
    try {
      setActivities(activities.filter(a => a.id !== id))

      const response = await fetch(`/api/modules/south-africa/activities?id=${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`
        }
      })

      if (!response.ok) {
        setActivities(previousActivities)
        throw new Error('Failed to delete activity')
      }
    } catch (err) {
      console.error('Error deleting activity:', err)
    }
  }

  return (
    <div className="flex flex-col lg:flex-row flex-1">
      {/* Main Content */}
      <div className="flex-1 p-4 md:p-6 lg:pr-3 space-y-4 md:space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-medium">South Africa</h1>
            <p className="text-muted-foreground mt-1 text-sm sm:text-base">2025 Family Adventure</p>
          </div>
          <Button onClick={openAddModal} className="w-full sm:w-auto">
            <Plus className="w-4 h-4 mr-2" />
            Add Activity
          </Button>
        </div>

        {/* Map */}
        <SouthAfricaMap activities={activities} />

        {/* Flight Cards */}
        <FlightCards />

        {/* Error Display */}
        {error && (
          <Card className="border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800">
            <CardContent className="pt-6">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </CardContent>
          </Card>
        )}

        {/* Task Sections */}
        <div className="grid gap-4 md:gap-6 md:grid-cols-2">
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
      <div className="w-full lg:w-80 bg-white dark:bg-background p-4 md:p-6 lg:pl-3 border-t lg:border-t-0 lg:border-l">
        <ActivityList activities={activities} onEdit={openEditModal} onDelete={handleDeleteActivity} />
      </div>

      {/* Activity Modal (Add/Edit) */}
      <Dialog open={isActivityModalOpen} onOpenChange={setIsActivityModalOpen}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-[425px] z-[9999] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg">{editingActivity ? 'Edit Activity' : 'Add Activity'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmitActivity} className="space-y-3 sm:space-y-4 pt-2 sm:pt-4">
            <div className="space-y-1.5 sm:space-y-2">
              <Label htmlFor="title" className="text-sm">Title</Label>
              <Input
                id="title"
                value={activityForm.title}
                onChange={(e) => setActivityForm({ ...activityForm, title: e.target.value })}
                placeholder="e.g., Hout Bay Airbnb"
                required
                className="h-9 sm:h-10"
              />
            </div>

            <div className="grid grid-cols-2 gap-2 sm:gap-4">
              <div className="space-y-1.5 sm:space-y-2">
                <Label htmlFor="start_date" className="text-sm">Start Date</Label>
                <Input
                  id="start_date"
                  type="date"
                  value={activityForm.start_date}
                  onChange={(e) => setActivityForm({ ...activityForm, start_date: e.target.value })}
                  required
                  className="h-9 sm:h-10 text-sm"
                />
              </div>
              <div className="space-y-1.5 sm:space-y-2">
                <Label htmlFor="end_date" className="text-sm">End Date</Label>
                <Input
                  id="end_date"
                  type="date"
                  value={activityForm.end_date}
                  onChange={(e) => setActivityForm({ ...activityForm, end_date: e.target.value })}
                  required
                  className="h-9 sm:h-10 text-sm"
                />
              </div>
            </div>

            <div className="space-y-1.5 sm:space-y-2">
              <Label htmlFor="address" className="text-sm">Address</Label>
              <Input
                id="address"
                value={activityForm.address}
                onChange={(e) => setActivityForm({ ...activityForm, address: e.target.value })}
                placeholder="Full address"
                required
                className="h-9 sm:h-10"
              />
            </div>

            <div className="space-y-1.5 sm:space-y-2">
              <Label htmlFor="type" className="text-sm">Type</Label>
              <Select
                value={activityForm.activity_type}
                onValueChange={(value: 'stay' | 'event') =>
                  setActivityForm({ ...activityForm, activity_type: value })
                }
              >
                <SelectTrigger className="h-9 sm:h-10">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent className="z-[10000]">
                  <SelectItem value="stay">Stay (Accommodation)</SelectItem>
                  <SelectItem value="event">Event</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:gap-4">
              <div className="space-y-1.5 sm:space-y-2">
                <Label htmlFor="lat" className="text-sm">Latitude (optional)</Label>
                <Input
                  id="lat"
                  type="number"
                  step="0.000001"
                  min="-90"
                  max="90"
                  value={activityForm.lat}
                  onChange={(e) => setActivityForm({ ...activityForm, lat: e.target.value })}
                  placeholder="-33.9"
                  className="h-9 sm:h-10"
                />
              </div>
              <div className="space-y-1.5 sm:space-y-2">
                <Label htmlFor="lng" className="text-sm">Longitude (optional)</Label>
                <Input
                  id="lng"
                  type="number"
                  step="0.000001"
                  min="-180"
                  max="180"
                  value={activityForm.lng}
                  onChange={(e) => setActivityForm({ ...activityForm, lng: e.target.value })}
                  placeholder="18.4"
                  className="h-9 sm:h-10"
                />
              </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2 sm:pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsActivityModalOpen(false)}
                className="w-full sm:w-auto"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submittingActivity} className="w-full sm:w-auto">
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
