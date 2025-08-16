import { NextRequest, NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function POST(req: NextRequest) {
  try {
    const user = await currentUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { workoutId, stationName, stationOrder, stationTime, completed } = await req.json()

    // Create Supabase client with service role key to bypass RLS
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    // Verify the workout belongs to this user
    const { data: workout, error: workoutError } = await supabase
      .from('hyrox_workouts')
      .select('user_id')
      .eq('id', workoutId)
      .single()

    if (workoutError || !workout || workout.user_id !== user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data, error } = await supabase
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

    if (error) {
      console.error('Error adding workout station:', error)
      throw error
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('API Error:', error)
    return NextResponse.json(
      { error: 'Failed to add workout station' },
      { status: 500 }
    )
  }
}