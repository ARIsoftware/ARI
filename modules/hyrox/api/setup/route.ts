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

// SQL to create HYROX tables
const CREATE_TABLES_SQL = `
-- Create hyrox_workouts table
CREATE TABLE IF NOT EXISTS hyrox_workouts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  total_time INTEGER DEFAULT 0,
  completed BOOLEAN DEFAULT FALSE,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create hyrox_workout_stations table  
CREATE TABLE IF NOT EXISTS hyrox_workout_stations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workout_id UUID NOT NULL REFERENCES hyrox_workouts(id) ON DELETE CASCADE,
  station_name TEXT NOT NULL,
  station_order INTEGER NOT NULL,
  station_time INTEGER, -- in milliseconds, can be null for skipped stations
  completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create hyrox_station_records table
CREATE TABLE IF NOT EXISTS hyrox_station_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  station_name TEXT NOT NULL,
  station_type TEXT NOT NULL CHECK (station_type IN ('run', 'exercise')),
  distance TEXT NOT NULL,
  best_time INTEGER NOT NULL, -- in milliseconds
  goal_time INTEGER NOT NULL, -- in milliseconds
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, station_name)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_hyrox_workouts_user_id ON hyrox_workouts(user_id);
CREATE INDEX IF NOT EXISTS idx_hyrox_workouts_completed ON hyrox_workouts(completed);
CREATE INDEX IF NOT EXISTS idx_hyrox_workout_stations_workout_id ON hyrox_workout_stations(workout_id);
CREATE INDEX IF NOT EXISTS idx_hyrox_station_records_user_id ON hyrox_station_records(user_id);

-- Enable RLS (Row Level Security) if not already enabled
ALTER TABLE hyrox_workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE hyrox_workout_stations ENABLE ROW LEVEL SECURITY;  
ALTER TABLE hyrox_station_records ENABLE ROW LEVEL SECURITY;
`

const CREATE_RLS_POLICIES_SQL = `
-- Create RLS policies for hyrox_workouts
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'hyrox_workouts' AND policyname = 'Users can manage own workouts'
    ) THEN
        CREATE POLICY "Users can manage own workouts" ON hyrox_workouts
            FOR ALL USING (auth.uid()::text = user_id);
    END IF;
END $$;

-- Create RLS policies for hyrox_workout_stations
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'hyrox_workout_stations' AND policyname = 'Users can manage own workout stations'
    ) THEN
        CREATE POLICY "Users can manage own workout stations" ON hyrox_workout_stations
            FOR ALL USING (
                EXISTS (
                    SELECT 1 FROM hyrox_workouts 
                    WHERE hyrox_workouts.id = hyrox_workout_stations.workout_id 
                    AND hyrox_workouts.user_id = auth.uid()::text
                )
            );
    END IF;
END $$;

-- Create RLS policies for hyrox_station_records
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'hyrox_station_records' AND policyname = 'Users can manage own station records'
    ) THEN
        CREATE POLICY "Users can manage own station records" ON hyrox_station_records
            FOR ALL USING (auth.uid()::text = user_id);
    END IF;
END $$;
`

async function initializeHyroxStationRecords(client: any, userId: string) {
  // Default station records data
  const defaultStationRecords = [
    {
      station_name: "Running",
      station_type: "exercise",
      distance: "8000m",
      best_time: 0,
      goal_time: 2400000, // 40:00 (40 minutes)
    },
    {
      station_name: "SkiErg",
      station_type: "exercise",
      distance: "1000m",
      best_time: 0,
      goal_time: 255000, // 4:15
    },
    {
      station_name: "Sled Push",
      station_type: "exercise",
      distance: "50m",
      best_time: 0,
      goal_time: 180000, // 3:00
    },
    {
      station_name: "Sled Pull",
      station_type: "exercise", 
      distance: "50m",
      best_time: 0,
      goal_time: 180000, // 3:00
    },
    {
      station_name: "Burpee Broad Jump",
      station_type: "exercise",
      distance: "80m",
      best_time: 0,
      goal_time: 360000, // 6:00
    },
    {
      station_name: "Rowing",
      station_type: "exercise",
      distance: "1000m", 
      best_time: 0,
      goal_time: 240000, // 4:00
    },
    {
      station_name: "Farmers Carry",
      station_type: "exercise",
      distance: "200m",
      best_time: 0,
      goal_time: 120000, // 2:00
    },
    {
      station_name: "Sandbag Lunges",
      station_type: "exercise",
      distance: "100m",
      best_time: 0,
      goal_time: 240000, // 4:00
    },
    {
      station_name: "Wall Balls",
      station_type: "exercise",
      distance: "100 reps",
      best_time: 0,
      goal_time: 300000, // 5:00
    }
  ]

  // Add user_id to each record
  const recordsWithUserId = defaultStationRecords.map(record => ({
    ...record,
    user_id: userId
  }))

  // Insert default station records
  const { error } = await client
    .from('hyrox_station_records')
    .upsert(recordsWithUserId, { onConflict: 'user_id,station_name' })

  if (error) {
    logger.error('Failed to initialize station records:', error)
    return false
  }

  return true
}

async function createHyroxTables() {
  try {
    const client = getServiceSupabase()
    
    logger.info('Setting up HYROX database...')
    
    // Since we can't execute raw SQL easily, let's check if tables exist by trying to query them
    // If they don't exist, the user will need to run the migration manually
    
    const { error: workoutsError } = await client
      .from('hyrox_workouts')
      .select('count')
      .limit(1)
      
    const { error: stationsError } = await client
      .from('hyrox_workout_stations')
      .select('count')
      .limit(1)
      
    const { error: recordsError } = await client
      .from('hyrox_station_records')
      .select('count')
      .limit(1)

    if (workoutsError || stationsError || recordsError) {
      return {
        success: false,
        message: 'HYROX tables do not exist',
        instructions: 'Please run the SQL script manually in your Supabase dashboard: the migrations folder',
        tables: {
          hyrox_workouts: !workoutsError,
          hyrox_workout_stations: !stationsError,
          hyrox_station_records: !recordsError
        }
      }
    }
    
    logger.info('HYROX tables exist, setup completed')
    
    return {
      success: true,
      message: 'HYROX tables are ready',
      tables: {
        hyrox_workouts: true,
        hyrox_workout_stations: true,
        hyrox_station_records: true
      }
    }
  } catch (error) {
    logger.error('Failed to setup HYROX tables:', error)
    return {
      success: false,
      error: 'Failed to setup tables',
      details: error
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    // Authenticate user
    const { user } = await getAuthenticatedUser()
    
    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      )
    }

    // Create HYROX tables
    const result = await createHyroxTables()
    
    return NextResponse.json(result)
  } catch (error: any) {
    logger.error('Setup API Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to setup HYROX tables' },
      { status: 500 }
    )
  }
}