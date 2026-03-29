'use client'

import { TaskAnalyticsChart } from './task-analytics-chart'
import { useSupabase } from '@/components/providers'

export default function TasksDashboardActivityWidget() {
  const { session } = useSupabase()
  return <TaskAnalyticsChart token={session?.access_token || null} />
}
