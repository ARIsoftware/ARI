import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { createClient } from "@supabase/supabase-js"
import { logger } from '@/lib/logger'

// Create service role client for admin operations
const getServiceSupabase = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY
  
  if (!supabaseUrl || !supabaseSecretKey) {
    throw new Error("Missing Supabase environment variables")
  }
  
  return createClient(supabaseUrl, supabaseSecretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
}

// Server-side database diagnostic function
async function testHyroxDatabase() {
  try {
    const client = getServiceSupabase()
    
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

    // If all queries succeed, database is working
    const success = !workoutsError && !stationsError && !recordsError

    return {
      success,
      tables: {
        hyrox_workouts: !workoutsError,
        hyrox_workout_stations: !stationsError,
        hyrox_station_records: !recordsError
      },
      errors: {
        workouts: workoutsError,
        stations: stationsError,
        records: recordsError
      }
    }
  } catch (error) {
    logger.error('Database test failed:', error)
    return { success: false, error: 'Database connection failed', details: error }
  }
}

export async function GET(req: NextRequest) {
  try {
    // Authenticate user
    const { user } = await getAuthenticatedUser()
    
    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      )
    }

    // Run database test
    const result = await testHyroxDatabase()
    
    return NextResponse.json(result)
  } catch (error: any) {
    logger.error('API Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to test database' },
      { status: 500 }
    )
  }
}