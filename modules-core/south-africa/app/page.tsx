/**
 * South Africa Module - Server Component
 *
 * Fetches initial data server-side for instant loading.
 * Route: /south-africa
 */

import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { createDbClient } from '@/lib/db'
import SouthAfricaClient from './south-africa-client'
import type { TravelTask, Activity } from '../types'

async function getServerData() {
  // Get current user via Better Auth
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  if (!session?.user) {
    return { tasks: [], activities: [] }
  }

  const supabase = createDbClient()

  // Fetch tasks and activities in parallel
  // Filter by user_id since we're using service role client
  const [tasksResult, activitiesResult] = await Promise.all([
    supabase
      .from('travel')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: true }),
    supabase
      .from('travel_activities')
      .select('*')
      .eq('user_id', session.user.id)
      .order('start_date', { ascending: true })
  ])

  return {
    tasks: (tasksResult.data || []) as TravelTask[],
    activities: (activitiesResult.data || []) as Activity[]
  }
}

export default async function SouthAfricaPage() {
  const { tasks, activities } = await getServerData()

  return (
    <SouthAfricaClient
      initialTasks={tasks}
      initialActivities={activities}
    />
  )
}
