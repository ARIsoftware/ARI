"use client"

import { useState, useEffect } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Loader2, Activity, CheckCircle, Clock, Plus, User } from "lucide-react"
import { formatDistanceToNow } from "date-fns"

interface ActivityItem {
  id: string
  type: 'task_created' | 'task_completed' | 'contact_added' | 'fitness_completed'
  title: string
  description: string
  timestamp: string
  icon: React.ReactNode
  color: string
}

interface RecentActivityFeedProps {
  token: string | null
}

export function RecentActivityFeed({ token }: RecentActivityFeedProps) {
  const [activities, setActivities] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return

    const fetchRecentActivity = async () => {
      try {
        setLoading(true)
        setError(null)

        // Fetch recent tasks, contacts, and fitness activities
        const [tasksResponse, contactsResponse, fitnessResponse] = await Promise.all([
          fetch('/api/tasks', {
            headers: { 'Authorization': `Bearer ${token}` }
          }),
          fetch('/api/contacts', {
            headers: { 'Authorization': `Bearer ${token}` }
          }).catch(() => ({ ok: false })), // Gracefully handle if contacts API doesn't exist
          // We could add fitness API call here if available
        ])

        let allActivities: ActivityItem[] = []

        // Process tasks
        if (tasksResponse.ok) {
          const tasks = await tasksResponse.json()
          const recentTasks = tasks
            .sort((a: any, b: any) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime())
            .slice(0, 10)

          recentTasks.forEach((task: any) => {
            // Task completion activity
            if (task.completed && task.updated_at !== task.created_at) {
              allActivities.push({
                id: `task_completed_${task.id}`,
                type: 'task_completed',
                title: 'Task Completed',
                description: task.title,
                timestamp: task.updated_at,
                icon: <CheckCircle className="w-4 h-4" />,
                color: 'text-green-600'
              })
            }

            // Task creation activity
            allActivities.push({
              id: `task_created_${task.id}`,
              type: 'task_created',
              title: 'Task Created',
              description: task.title,
              timestamp: task.created_at,
              icon: <Plus className="w-4 h-4" />,
              color: 'text-blue-600'
            })
          })
        }

        // Process contacts
        if (contactsResponse.ok) {
          const contacts = await contactsResponse.json()
          const recentContacts = contacts
            .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .slice(0, 5)

          recentContacts.forEach((contact: any) => {
            allActivities.push({
              id: `contact_added_${contact.id}`,
              type: 'contact_added',
              title: 'Contact Added',
              description: `${contact.first_name} ${contact.last_name}`,
              timestamp: contact.created_at,
              icon: <User className="w-4 h-4" />,
              color: 'text-purple-600'
            })
          })
        }

        // Sort all activities by timestamp and take the most recent 15
        const sortedActivities = allActivities
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
          .slice(0, 15)

        setActivities(sortedActivities)

      } catch (err) {
        console.error('Error fetching recent activity:', err)
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }

    fetchRecentActivity()
  }, [token])

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-blue-600" />
            Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-[300px]">
            <div className="flex items-center gap-2">
              <Loader2 className="w-6 h-6 animate-spin" />
              <span>Loading recent activity...</span>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-blue-600" />
            Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-[300px]">
            <div className="text-center">
              <p className="text-muted-foreground">Failed to load activity feed</p>
              <p className="text-sm text-red-500 mt-1">{error}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (activities.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-blue-600" />
            Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-[300px]">
            <div className="text-center">
              <Clock className="w-12 h-12 mx-auto text-muted-foreground mb-2" />
              <p className="text-muted-foreground">No recent activity</p>
              <p className="text-sm text-muted-foreground mt-1">Start creating tasks to see activity here</p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-blue-600" />
          Activity
        </CardTitle>
      </CardHeader>
      <CardContent>
        <TooltipProvider>
          <div className="space-y-4 max-h-[400px] overflow-y-auto">
            {activities.map((activity) => (
              <div key={activity.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted/80 transition-colors">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className={`p-2 rounded-full bg-background ${activity.color} cursor-default`}>
                      {activity.icon}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="max-w-xs">
                    <div className="text-xs">
                      <p className="font-semibold">{activity.title}</p>
                      <p className="text-muted-foreground">
                        {formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })}
                      </p>
                    </div>
                  </TooltipContent>
                </Tooltip>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-muted-foreground truncate">
                    {activity.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </TooltipProvider>
      </CardContent>
    </Card>
  )
}