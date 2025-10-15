// HYROX TypeScript interfaces (safe for client-side import)

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