/**
 * South Africa Module - Server Component
 *
 * Fetches initial data server-side for instant loading.
 * Route: /south-africa
 */

import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { createDbClient } from '@/lib/db-supabase'
import SouthAfricaClient from './south-africa-client'
import type { TravelTask, Activity, Flight } from '../types'

async function getServerData() {
  // Get current user via Better Auth
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  if (!session?.user) {
    return { tasks: [], activities: [], flights: [] }
  }

  const supabase = createDbClient()

  // Fetch tasks, activities, and flights in parallel
  // Filter by user_id since we're using service role client
  const [tasksResult, activitiesResult, flightsResult] = await Promise.all([
    supabase
      .from('travel')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: true }),
    supabase
      .from('travel_activities')
      .select('*')
      .eq('user_id', session.user.id)
      .order('start_date', { ascending: true }),
    supabase
      .from('travel_flights')
      .select('*')
      .eq('user_id', session.user.id)
      .order('sort_order', { ascending: true })
  ])

  return {
    tasks: (tasksResult.data || []) as TravelTask[],
    activities: (activitiesResult.data || []) as Activity[],
    flights: (flightsResult.data || []) as Flight[]
  }
}

export default async function SouthAfricaPage() {
  const { tasks, activities, flights } = await getServerData()

  return (
    <SouthAfricaClient
      initialTasks={tasks}
      initialActivities={activities}
      initialFlights={flights}
    />
  )
}
