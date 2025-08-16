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
      throw error
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
        throw insertError
      }

      return NextResponse.json(insertedData || records)
    }

    // Check if any records have 0 times and reset them to defaults
    const recordsWithDefaults = data.map(record => {
      if (record.best_time === 0 || !record.best_time) {
        const defaultRecord = defaultStationRecords.find(
          dr => dr.station_name === record.station_name
        )
        if (defaultRecord) {
          // Update the record in the database with default values
          supabase
            .from('hyrox_station_records')
            .update({ best_time: defaultRecord.best_time })
            .eq('user_id', user.id)
            .eq('station_name', record.station_name)
            .then(({ error }) => {
              if (error) console.error('Error updating to default:', error)
            })
          
          return {
            ...record,
            best_time: defaultRecord.best_time,
            goal_time: record.goal_time || defaultRecord.goal_time
          }
        }
      }
      return record
    })

    return NextResponse.json(recordsWithDefaults)
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
      throw fetchError
    }

    // Only update if new time is better (lower) or if current time is 0
    if (currentRecord && (newTime < currentRecord.best_time || currentRecord.best_time === 0)) {
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
      
      return NextResponse.json(data)
    }

    return NextResponse.json(currentRecord)
  } catch (error) {
    console.error('API Error:', error)
    return NextResponse.json(
      { error: 'Failed to update station record' },
      { status: 500 }
    )
  }
}