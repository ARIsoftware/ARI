import { supabase } from './supabase'
import { supabaseServiceRole } from './supabase-with-clerk'

// Diagnostic function to test database connectivity and table existence
export async function testHyroxDatabase() {
  try {
    // Use service role for testing
    const client = supabaseServiceRole()
    
    // Test basic connectivity
    const { data: authTest, error: authError } = await client.auth.getUser()
    if (authError) {
      console.error('Auth error:', authError)
      return { success: false, error: 'Authentication failed', details: authError }
    }

    // Test table existence by trying to count rows
    const { data: workoutsTest, error: workoutsError } = await client
      .from('hyrox_workouts')
      .select('count')
      .limit(1)
      
    const { data: stationsTest, error: stationsError } = await client
      .from('hyrox_workout_stations')
      .select('count')
      .limit(1)
      
    const { data: recordsTest, error: recordsError } = await client
      .from('hyrox_station_records')
      .select('count')
      .limit(1)

    return {
      success: true,
      tables: {
        hyrox_workouts: !workoutsError,
        hyrox_workout_stations: !stationsError,
        hyrox_station_records: !recordsError
      },
      errors: {
        workouts: workoutsError,
        stations: stationsError,
        records: recordsError
      },
      user: authTest.user?.id
    }
  } catch (error) {
    console.error('Database test failed:', error)
    return { success: false, error: 'Database connection failed', details: error }
  }
}

// Types
export interface HyroxStationRecord {
  id: string
  user_id: string
  station_name: string
  station_type: 'run' | 'exercise'
  distance: string
  best_time: number
  goal_time: number
  created_at: string
  updated_at: string
}

export interface HyroxWorkout {
  id: string
  user_id: string
  total_time: number
  completed: boolean
  started_at: string
  completed_at: string | null
  created_at: string
}

export interface HyroxWorkoutStation {
  id: string
  workout_id: string
  station_name: string
  station_order: number
  station_time: number | null
  completed: boolean
  created_at: string
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

// Get all station records for a user
export async function getHyroxStationRecords(userId: string): Promise<HyroxStationRecord[]> {
  try {
    const client = supabaseServiceRole()
    const { data, error } = await client
      .from('hyrox_station_records')
      .select('*')
      .eq('user_id', userId)
      .order('station_name')

    if (error) throw error

    // If no records exist, create default records
    if (!data || data.length === 0) {
      await initializeStationRecords(userId)
      return getHyroxStationRecords(userId)
    }

    // Check if any records have 0 times and reset them to defaults
    const recordsWithDefaults = data.map(record => {
      if (record.best_time === 0 || !record.best_time) {
        const defaultRecord = defaultStationRecords.find(
          dr => dr.station_name === record.station_name
        )
        if (defaultRecord) {
          // Update the record in the database with default values
          updateStationRecordToDefault(userId, record.station_name, defaultRecord.best_time)
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
    console.error('Error fetching Hyrox station records:', error)
    return []
  }
}

// Helper function to update a station record to default values
async function updateStationRecordToDefault(
  userId: string,
  stationName: string,
  defaultBestTime: number
): Promise<void> {
  try {
    const client = supabaseServiceRole()
    await client
      .from('hyrox_station_records')
      .update({ best_time: defaultBestTime })
      .eq('user_id', userId)
      .eq('station_name', stationName)
  } catch (error) {
    console.error('Error updating station record to default:', error)
  }
}

// Initialize default station records for a new user
export async function initializeStationRecords(userId: string): Promise<void> {
  try {
    const client = supabaseServiceRole()
    const records = defaultStationRecords.map(record => ({
      ...record,
      user_id: userId,
    }))

    const { error } = await client
      .from('hyrox_station_records')
      .insert(records)

    if (error) throw error
  } catch (error) {
    console.error('Error initializing station records:', error)
  }
}

// Update a station record (new personal best)
export async function updateStationRecord(
  userId: string,
  stationName: string,
  newTime: number
): Promise<HyroxStationRecord | null> {
  try {
    const client = supabaseServiceRole()
    
    // First get the current record
    const { data: currentRecord, error: fetchError } = await client
      .from('hyrox_station_records')
      .select('*')
      .eq('user_id', userId)
      .eq('station_name', stationName)
      .single()

    if (fetchError) throw fetchError

    // Only update if new time is better (lower)
    if (currentRecord && newTime < currentRecord.best_time) {
      const { data, error } = await client
        .from('hyrox_station_records')
        .update({ best_time: newTime })
        .eq('user_id', userId)
        .eq('station_name', stationName)
        .select()
        .single()

      if (error) throw error
      return data
    }

    return currentRecord
  } catch (error) {
    console.error('Error updating station record:', error)
    return null
  }
}

// Create a new workout session
export async function createHyroxWorkout(userId: string): Promise<HyroxWorkout | null> {
  try {
    const client = supabaseServiceRole()
    const { data, error } = await client
      .from('hyrox_workouts')
      .insert({
        user_id: userId,
        total_time: 0,
        completed: false,
      })
      .select()
      .single()

    if (error) throw error
    return data
  } catch (error) {
    console.error('Error creating Hyrox workout:', {
      error,
      userId
    })
    return null
  }
}

// Complete a workout session
export async function completeHyroxWorkout(
  workoutId: string,
  totalTime: number
): Promise<HyroxWorkout | null> {
  try {
    const client = supabaseServiceRole()
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
    console.error('Error completing Hyrox workout:', error)
    return null
  }
}

// Add a station time to a workout
export async function addWorkoutStation(
  workoutId: string,
  stationName: string,
  stationOrder: number,
  stationTime: number | null,
  completed: boolean = true
): Promise<HyroxWorkoutStation | null> {
  try {
    const client = supabaseServiceRole()
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
    console.error('Error adding workout station:', {
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

// Get workout history for a user
export async function getHyroxWorkoutHistory(
  userId: string,
  limit: number = 10
): Promise<HyroxWorkout[]> {
  try {
    const client = supabaseServiceRole()
    const { data, error } = await client
      .from('hyrox_workouts')
      .select('*')
      .eq('user_id', userId)
      .eq('completed', true)
      .order('completed_at', { ascending: false })
      .limit(limit)

    if (error) throw error
    return data || []
  } catch (error) {
    console.error('Error fetching workout history:', error)
    return []
  }
}

// Get stations for a specific workout
export async function getWorkoutStations(
  workoutId: string
): Promise<HyroxWorkoutStation[]> {
  try {
    const client = supabaseServiceRole()
    const { data, error } = await client
      .from('hyrox_workout_stations')
      .select('*')
      .eq('workout_id', workoutId)
      .order('station_order')

    if (error) throw error
    return data || []
  } catch (error) {
    console.error('Error fetching workout stations:', error)
    return []
  }
}

// Calculate progress percentage for a station
export function calculateProgress(currentTime: number, goalTime: number): number {
  if (currentTime <= goalTime) return 100
  const maxTime = goalTime * 1.5 // Consider 150% of goal as 0% progress
  const progress = ((maxTime - currentTime) / (maxTime - goalTime)) * 100
  return Math.max(0, Math.min(100, progress))
}

// Format milliseconds to MM:SS
export function formatTime(milliseconds: number): string {
  // If the time is 0 or invalid, return a placeholder
  if (!milliseconds || milliseconds === 0) {
    return '0:00'
  }
  const totalSeconds = Math.floor(milliseconds / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

// Get time difference for display (e.g., "+15s" or "-10s")
export function getTimeDifference(currentTime: number, goalTime: number): string {
  const diff = Math.abs(currentTime - goalTime) / 1000
  const sign = currentTime > goalTime ? '+' : '-'
  return `${sign}${Math.round(diff)}s`
}