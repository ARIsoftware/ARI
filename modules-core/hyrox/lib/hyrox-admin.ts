// Server-only HYROX admin functions using service role
// DO NOT IMPORT THIS IN CLIENT COMPONENTS

import { createClient } from '@supabase/supabase-js'
import { logger } from './logger'
import type { HyroxStationRecord, HyroxWorkout, HyroxWorkoutStation } from './hyrox-types'

// Create service role client for admin operations
const getServiceSupabase = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY
  
  if (!supabaseUrl || !supabaseSecretKey) {
    throw new Error("Missing Supabase environment variables for service role")
  }
  
  return createClient(supabaseUrl, supabaseSecretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
}

// Default station records data
const defaultStationRecords = [
  {
    station_name: "SkiErg",
    station_type: "exercise" as const,
    distance: "1000m",
    best_time: 272000, // 4:32
    goal_time: 255000, // 4:15
  },
  {
    station_name: "Sled Push",
    station_type: "exercise" as const,
    distance: "50m",
    best_time: 198000, // 3:18
    goal_time: 180000, // 3:00
  },
  {
    station_name: "Sled Pull",
    station_type: "exercise" as const,
    distance: "50m",
    best_time: 225000, // 3:45
    goal_time: 210000, // 3:30
  },
  {
    station_name: "Burpee Broad Jump",
    station_type: "exercise" as const,
    distance: "80m",
    best_time: 405000, // 6:45
    goal_time: 375000, // 6:15
  },
  {
    station_name: "Rowing",
    station_type: "exercise" as const,
    distance: "1000m",
    best_time: 298000, // 4:58
    goal_time: 270000, // 4:30
  },
  {
    station_name: "Farmers Carry",
    station_type: "exercise" as const,
    distance: "200m",
    best_time: 138000, // 2:18
    goal_time: 120000, // 2:00
  },
  {
    station_name: "Sandbag Lunges",
    station_type: "exercise" as const,
    distance: "100m",
    best_time: 252000, // 4:12
    goal_time: 225000, // 3:45
  },
  {
    station_name: "Wall Balls",
    station_type: "exercise" as const,
    distance: "100 reps",
    best_time: 205000, // 3:25
    goal_time: 180000, // 3:00
  },
  {
    station_name: "1km Run",
    station_type: "run" as const,
    distance: "1000m",
    best_time: 335000, // 5:35
    goal_time: 300000, // 5:00
  },
]

// Get all station records with service role (for admin/initialization purposes)
export async function getHyroxStationRecordsAdmin(): Promise<HyroxStationRecord[]> {
  try {
    const client = getServiceSupabase()
    const { data, error } = await client
      .from('hyrox_station_records')
      .select('*')
      .order('station_name')

    if (error) throw error

    // If no records exist, create default records
    if (!data || data.length === 0) {
      await initializeStationRecordsAdmin()
      return getHyroxStationRecordsAdmin()
    }

    // Check if any records have 0 times and reset them to defaults
    const recordsWithDefaults = data.map(record => {
      if (record.best_time === 0 || !record.best_time) {
        const defaultRecord = defaultStationRecords.find(
          dr => dr.station_name === record.station_name
        )
        if (defaultRecord) {
          // Update the record in the database with default values
          updateStationRecordToDefaultAdmin(record.station_name, defaultRecord.best_time)
          return {
            ...record,
            best_time: defaultRecord.best_time,
            goal_time: record.goal_time || defaultRecord.goal_time
          }
        }
      }
      return record
    })

    return recordsWithDefaults
  } catch (error) {
    logger.error('Error fetching Hyrox station records (admin):', error)
    return []
  }
}

// Helper function to update a station record to default values (admin)
async function updateStationRecordToDefaultAdmin(
  stationName: string,
  defaultBestTime: number
): Promise<void> {
  try {
    const client = getServiceSupabase()
    await client
      .from('hyrox_station_records')
      .update({ best_time: defaultBestTime })
      .eq('station_name', stationName)
  } catch (error) {
    logger.error('Error updating station record to default (admin):', error)
  }
}

// Initialize default station records (admin)
export async function initializeStationRecordsAdmin(userId?: string): Promise<void> {
  try {
    const client = getServiceSupabase()
    const records = defaultStationRecords.map(record => ({
      ...record,
      ...(userId && { user_id: userId })
    }))

    const { error } = await client
      .from('hyrox_station_records')
      .insert(records)

    if (error) throw error
  } catch (error) {
    logger.error('Error initializing station records (admin):', error)
  }
}

// Update a station record (admin - bypasses RLS)
export async function updateStationRecordAdmin(
  stationName: string,
  newTime: number,
  userId?: string
): Promise<HyroxStationRecord | null> {
  try {
    const client = getServiceSupabase()
    
    // Build query
    let query = client
      .from('hyrox_station_records')
      .select('*')
      .eq('station_name', stationName)
    
    if (userId) {
      query = query.eq('user_id', userId)
    }
    
    const { data: currentRecord, error: fetchError } = await query.single()

    if (fetchError) throw fetchError

    // Only update if new time is better (lower)
    if (currentRecord && newTime < currentRecord.best_time) {
      let updateQuery = client
        .from('hyrox_station_records')
        .update({ best_time: newTime })
        .eq('station_name', stationName)
      
      if (userId) {
        updateQuery = updateQuery.eq('user_id', userId)
      }
      
      const { data, error } = await updateQuery
        .select()
        .single()

      if (error) throw error
      return data
    }

    return currentRecord
  } catch (error) {
    logger.error('Error updating station record (admin):', error)
    return null
  }
}

// Create a new workout session (admin)
export async function createHyroxWorkoutAdmin(userId?: string): Promise<HyroxWorkout | null> {
  try {
    const client = getServiceSupabase()
    const { data, error } = await client
      .from('hyrox_workouts')
      .insert({
        total_time: 0,
        completed: false,
        ...(userId && { user_id: userId })
      })
      .select()
      .single()

    if (error) throw error
    return data
  } catch (error) {
    logger.error('Error creating Hyrox workout (admin):', error)
    return null
  }
}

// Complete a workout session (admin)
export async function completeHyroxWorkoutAdmin(
  workoutId: string,
  totalTime: number
): Promise<HyroxWorkout | null> {
  try {
    const client = getServiceSupabase()
    const { data, error } = await client
      .from('hyrox_workouts')
      .update({
        total_time: totalTime,
        completed: true,
        completed_at: new Date().toISOString(),
      })
      .eq('id', workoutId)
      .select()
      .single()

    if (error) throw error
    return data
  } catch (error) {
    logger.error('Error completing Hyrox workout (admin):', error)
    return null
  }
}

// Add a station time to a workout (admin)
export async function addWorkoutStationAdmin(
  workoutId: string,
  stationName: string,
  stationOrder: number,
  stationTime: number | null,
  completed: boolean = true
): Promise<HyroxWorkoutStation | null> {
  try {
    const client = getServiceSupabase()
    const { data, error } = await client
      .from('hyrox_workout_stations')
      .insert({
        workout_id: workoutId,
        station_name: stationName,
        station_order: stationOrder,
        station_time: stationTime,
        completed: completed,
      })
      .select()
      .single()

    if (error) throw error
    return data
  } catch (error) {
    logger.error('Error adding workout station (admin):', {
      error,
      workoutId,
      stationName,
      stationOrder,
      stationTime,
      completed
    })
    return null
  }
}

// Get workout history (admin - bypasses RLS)
export async function getHyroxWorkoutHistoryAdmin(
  limit: number = 10,
  userId?: string
): Promise<HyroxWorkout[]> {
  try {
    const client = getServiceSupabase()
    let query = client
      .from('hyrox_workouts')
      .select('*')
      .eq('completed', true)
      .order('completed_at', { ascending: false })
      .limit(limit)
    
    if (userId) {
      query = query.eq('user_id', userId)
    }

    const { data, error } = await query

    if (error) throw error
    return data || []
  } catch (error) {
    logger.error('Error fetching workout history (admin):', error)
    return []
  }
}

// Get stations for a specific workout (admin)
export async function getWorkoutStationsAdmin(
  workoutId: string
): Promise<HyroxWorkoutStation[]> {
  try {
    const client = getServiceSupabase()
    const { data, error } = await client
      .from('hyrox_workout_stations')
      .select('*')
      .eq('workout_id', workoutId)
      .order('station_order')

    if (error) throw error
    return data || []
  } catch (error) {
    logger.error('Error fetching workout stations (admin):', error)
    return []
  }
}