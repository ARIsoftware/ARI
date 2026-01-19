'use client'

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Loader2, Activity, CheckCircle, Clock, Plus, User } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

interface ActivityItem {
  id: string
  type: 'task_created' | 'task_completed' | 'contact_added'
  title: string
  description: string
  timestamp: string
}

interface RecentActivityFeedProps {
  activities: ActivityItem[]
  isLoading?: boolean
}

function safeFormatDistanceToNow(timestamp: string | null | undefined): string {
  if (!timestamp) return 'Unknown time'
  try {
    const date = new Date(timestamp)
    if (isNaN(date.getTime())) return 'Unknown time'
    return formatDistanceToNow(date, { addSuffix: true })
  } catch {
    return 'Unknown time'
  }
}

function getActivityIcon(type: ActivityItem['type']) {
  switch (type) {
    case 'task_completed':
      return <CheckCircle className="w-4 h-4" />
    case 'task_created':
      return <Plus className="w-4 h-4" />
    case 'contact_added':
      return <User className="w-4 h-4" />
    default:
      return <Activity className="w-4 h-4" />
  }
}

function getActivityColor(type: ActivityItem['type']) {
  switch (type) {
    case 'task_completed':
      return 'text-green-600'
    case 'task_created':
      return 'text-blue-600'
    case 'contact_added':
      return 'text-purple-600'
    default:
      return 'text-gray-600'
  }
}

export function RecentActivityFeed({ activities, isLoading = false }: RecentActivityFeedProps) {
  if (isLoading) {
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
              <p className="text-sm text-muted-foreground mt-1">
                Start creating tasks to see activity here
              </p>
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
          <div className="space-y-4 max-h-[800px] overflow-y-auto">
            {activities.map((activity) => (
              <div
                key={activity.id}
                className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted/80 transition-colors"
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className={`p-2 rounded-full bg-background ${getActivityColor(activity.type)} cursor-default`}
                    >
                      {getActivityIcon(activity.type)}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="max-w-xs">
                    <div className="text-xs">
                      <p className="font-semibold">{activity.title}</p>
                      <p className="text-muted-foreground">
                        {safeFormatDistanceToNow(activity.timestamp)}
                      </p>
                    </div>
                  </TooltipContent>
                </Tooltip>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-muted-foreground truncate">{activity.description}</p>
                </div>
              </div>
            ))}
          </div>
        </TooltipProvider>
      </CardContent>
    </Card>
  )
}
