// Client-side functions for Hyrox that use API routes

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

// Get all station records for a user
export async function getHyroxStationRecords(userId: string): Promise<HyroxStationRecord[]> {
  try {
    const response = await fetch('/api/hyrox/station-records', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error('Failed to fetch station records')
    }

    const data = await response.json()
    return data
  } catch (error) {
    console.error('Error fetching Hyrox station records:', error)
    return []
  }
}

// Update a station record (new personal best)
export async function updateStationRecord(
  userId: string,
  stationName: string,
  newTime: number
): Promise<HyroxStationRecord | null> {
  try {
    const response = await fetch('/api/hyrox/station-records', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ stationName, newTime }),
    })

    if (!response.ok) {
      throw new Error('Failed to update station record')
    }

    const data = await response.json()
    return data
  } catch (error) {
    console.error('Error updating station record:', error)
    return null
  }
}

// Create a new workout session
export async function createHyroxWorkout(userId: string): Promise<HyroxWorkout | null> {
  try {
    const response = await fetch('/api/hyrox/workouts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error('Failed to create workout')
    }

    const data = await response.json()
    return data
  } catch (error) {
    console.error('Error creating Hyrox workout:', error)
    return null
  }
}

// Complete a workout session
export async function completeHyroxWorkout(
  workoutId: string,
  totalTime: number
): Promise<HyroxWorkout | null> {
  try {
    const response = await fetch('/api/hyrox/workouts', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ workoutId, totalTime }),
    })

    if (!response.ok) {
      throw new Error('Failed to complete workout')
    }

    const data = await response.json()
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
    const response = await fetch('/api/hyrox/workout-stations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        workoutId,
        stationName,
        stationOrder,
        stationTime,
        completed,
      }),
    })

    if (!response.ok) {
      throw new Error('Failed to add workout station')
    }

    const data = await response.json()
    return data
  } catch (error) {
    console.error('Error adding workout station:', error)
    return null
  }
}

// Get workout history for a user
export async function getHyroxWorkoutHistory(
  userId: string,
  limit: number = 10
): Promise<HyroxWorkout[]> {
  try {
    const response = await fetch(`/api/hyrox/workouts?limit=${limit}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error('Failed to fetch workout history')
    }

    const data = await response.json()
    return data || []
  } catch (error) {
    console.error('Error fetching workout history:', error)
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