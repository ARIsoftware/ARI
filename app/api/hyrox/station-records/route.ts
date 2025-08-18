import { NextRequest, NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Default station records data
const defaultStationRecords = [
  {
    station_name: "SkiErg",
    station_type: "exercise" as const,
    distance: "1000m",
    best_time: 0, // Start with 0 to indicate no time set
    goal_time: 255000, // 4:15
  },
  {
    station_name: "Sled Push",
    station_type: "exercise" as const,
    distance: "50m",
    best_time: 0, // Start with 0 to indicate no time set
    goal_time: 180000, // 3:00
  },
  {
    station_name: "Sled Pull",
    station_type: "exercise" as const,
    distance: "50m",
    best_time: 0, // Start with 0 to indicate no time set
    goal_time: 210000, // 3:30
  },
  {
    station_name: "Burpee Broad Jump",
    station_type: "exercise" as const,
    distance: "80m",
    best_time: 0, // Start with 0 to indicate no time set
    goal_time: 375000, // 6:15
  },
  {
    station_name: "Rowing",
    station_type: "exercise" as const,
    distance: "1000m",
    best_time: 0, // Start with 0 to indicate no time set
    goal_time: 270000, // 4:30
  },
  {
    station_name: "Farmers Carry",
    station_type: "exercise" as const,
    distance: "200m",
    best_time: 0, // Start with 0 to indicate no time set
    goal_time: 120000, // 2:00
  },
  {
    station_name: "Sandbag Lunges",
    station_type: "exercise" as const,
    distance: "100m",
    best_time: 0, // Start with 0 to indicate no time set
    goal_time: 225000, // 3:45
  },
  {
    station_name: "Wall Balls",
    station_type: "exercise" as const,
    distance: "100 reps",
    best_time: 0, // Start with 0 to indicate no time set
    goal_time: 180000, // 3:00
  },
  {
    station_name: "1km Run",
    station_type: "run" as const,
    distance: "1000m",
    best_time: 0, // Start with 0 to indicate no time set
    goal_time: 300000, // 5:00
  },
]

export async function GET(req: NextRequest) {
  try {
    const user = await currentUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Create Supabase client with service role key to bypass RLS
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    // Fetch station records for the user
    const { data, error } = await supabase
      .from('hyrox_station_records')
      .select('*')
      .eq('user_id', user.id)
      .order('station_name')

    if (error) {
      console.error('Error fetching station records:', error)
      // Return default records if there's an error
      const records = defaultStationRecords.map(record => ({
        ...record,
        user_id: user.id,
        id: `temp-${record.station_name}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }))
      return NextResponse.json(records)
    }

    // If no records exist, create default records
    if (!data || data.length === 0) {
      console.log('No records found, creating defaults for user:', user.id)
      
      const records = defaultStationRecords.map(record => ({
        ...record,
        user_id: user.id,
      }))

      const { data: insertedData, error: insertError } = await supabase
        .from('hyrox_station_records')
        .insert(records)
        .select()

      if (insertError) {
        console.error('Error inserting default records:', insertError)
        // Return the default records even if insert fails
        const fallbackRecords = records.map(record => ({
          ...record,
          id: `temp-${record.station_name}`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }))
        return NextResponse.json(fallbackRecords)
      }

      return NextResponse.json(insertedData || records)
    }

    // Return the data as-is, keeping 0 values to indicate no time set
    console.log(`Returning ${data.length} station records for user ${user.id}`)
    return NextResponse.json(data)
  } catch (error) {
    console.error('API Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch station records' },
      { status: 500 }
    )
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await currentUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { stationName, newTime } = await req.json()
    
    console.log(`Updating station record: user=${user.id}, station=${stationName}, newTime=${newTime}`)

    // Create Supabase client with service role key to bypass RLS
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    // First get the current record
    const { data: currentRecord, error: fetchError } = await supabase
      .from('hyrox_station_records')
      .select('*')
      .eq('user_id', user.id)
      .eq('station_name', stationName)
      .single()

    if (fetchError) {
      console.error('Error fetching current record:', fetchError)
      
      // If record doesn't exist, create it
      if (fetchError.code === 'PGRST116') {
        const defaultRecord = defaultStationRecords.find(dr => dr.station_name === stationName)
        const newRecord = {
          user_id: user.id,
          station_name: stationName,
          station_type: defaultRecord?.station_type || 'exercise',
          distance: defaultRecord?.distance || '',
          best_time: newTime,
          goal_time: defaultRecord?.goal_time || 0,
        }
        
        const { data: insertedData, error: insertError } = await supabase
          .from('hyrox_station_records')
          .insert(newRecord)
          .select()
          .single()
        
        if (insertError) {
          console.error('Error inserting new record:', insertError)
          throw insertError
        }
        
        console.log(`Created new record for ${stationName} with time ${newTime}`)
        return NextResponse.json(insertedData)
      }
      
      throw fetchError
    }

    console.log(`Current best time for ${stationName}: ${currentRecord.best_time}, new time: ${newTime}`)
    
    // Update if:
    // 1. Current time is 0 (no time set yet), OR
    // 2. New time is better (lower) than current
    if (currentRecord && (currentRecord.best_time === 0 || newTime < currentRecord.best_time)) {
      const { data, error } = await supabase
        .from('hyrox_station_records')
        .update({ 
          best_time: newTime,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', user.id)
        .eq('station_name', stationName)
        .select()
        .single()

      if (error) {
        console.error('Error updating record:', error)
        throw error
      }
      
      console.log(`Updated ${stationName} from ${currentRecord.best_time} to ${newTime}`)
      return NextResponse.json(data)
    }

    console.log(`Not updating ${stationName} - current time ${currentRecord.best_time} is better than ${newTime}`)
    return NextResponse.json(currentRecord)
  } catch (error) {
    console.error('API Error:', error)
    return NextResponse.json(
      { error: 'Failed to update station record' },
      { status: 500 }
    )
  }
}