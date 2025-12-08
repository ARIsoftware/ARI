/**
 * South Africa Module - Server Component
 *
 * Fetches initial data server-side for instant loading.
 * Route: /south-africa
 */

import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import SouthAfricaClient from './south-africa-client'
import type { TravelTask, Activity } from '../types'

async function getServerData() {
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
      },
    }
  )

  // Get current user
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { tasks: [], activities: [] }
  }

  // Fetch tasks and activities in parallel
  const [tasksResult, activitiesResult] = await Promise.all([
    supabase
      .from('travel')
      .select('*')
      .order('created_at', { ascending: true }),
    supabase
      .from('travel_activities')
      .select('*')
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
