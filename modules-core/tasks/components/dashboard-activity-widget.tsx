'use client'

import { TaskAnalyticsChart } from './task-analytics-chart'
import { useAuth } from "@/components/providers"

export default function TasksDashboardActivityWidget() {
  const { session } = useAuth()
  return <TaskAnalyticsChart token={session?.access_token || null} />
}
