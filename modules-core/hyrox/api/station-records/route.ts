import { NextRequest, NextResponse } from "next/server"
import { logger } from '@/lib/logger'
import { validateRequestBody, createErrorResponse, toSnakeCase } from '@/lib/api-helpers'
import { updateStationRecordSchema } from '@/lib/validation'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { hyroxStationRecords } from '@/lib/db/schema'
import { eq, and, asc, sql } from 'drizzle-orm'

// Default station records data
const defaultStationRecords = [
  {
    stationName: "SkiErg",
    stationType: "exercise" as const,
    distance: "1000m",
    bestTime: 0, // Start with 0 to indicate no time set
    goalTime: 255000, // 4:15
  },
  {
    stationName: "Sled Push",
    stationType: "exercise" as const,
    distance: "50m",
    bestTime: 0,
    goalTime: 180000, // 3:00
  },
  {
    stationName: "Sled Pull",
    stationType: "exercise" as const,
    distance: "50m",
    bestTime: 0,
    goalTime: 210000, // 3:30
  },
  {
    stationName: "Burpee Broad Jump",
    stationType: "exercise" as const,
    distance: "80m",
    bestTime: 0,
    goalTime: 375000, // 6:15
  },
  {
    stationName: "Rowing",
    stationType: "exercise" as const,
    distance: "1000m",
    bestTime: 0,
    goalTime: 270000, // 4:30
  },
  {
    stationName: "Farmers Carry",
    stationType: "exercise" as const,
    distance: "200m",
    bestTime: 0,
    goalTime: 120000, // 2:00
  },
  {
    stationName: "Sandbag Lunges",
    stationType: "exercise" as const,
    distance: "100m",
    bestTime: 0,
    goalTime: 225000, // 3:45
  },
  {
    stationName: "Wall Balls",
    stationType: "exercise" as const,
    distance: "100 reps",
    bestTime: 0,
    goalTime: 180000, // 3:00
  },
  {
    stationName: "1km Run",
    stationType: "run" as const,
    distance: "1000m",
    bestTime: 0,
    goalTime: 300000, // 5:00
  },
]

export async function GET(req: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return createErrorResponse("Authentication required", 401)
    }

    const data = await withRLS((db) =>
      db.select()
        .from(hyroxStationRecords)
        .where(eq(hyroxStationRecords.userId, user.id))
        .orderBy(asc(hyroxStationRecords.stationName))
    )

    // If no records exist, create default records
    if (!data || data.length === 0) {
      logger.info('No records found, creating defaults for user:', user.id)

      const records = defaultStationRecords.map(record => ({
        ...record,
        userId: user.id,
      }))

      try {
        const insertedData = await withRLS((db) =>
          db.insert(hyroxStationRecords)
            .values(records)
            .returning()
        )
        return NextResponse.json(toSnakeCase(insertedData) || toSnakeCase(records))
      } catch (insertError) {
        logger.error('Error inserting default records:', insertError)
        // Return the default records even if insert fails
        const fallbackRecords = defaultStationRecords.map(record => ({
          ...record,
          id: `temp-${record.stationName}`,
          userId: user.id,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }))
        return NextResponse.json(toSnakeCase(fallbackRecords))
      }
    }

    // Return the data as-is, keeping 0 values to indicate no time set
    logger.info(`Returning ${data.length} station records for user ${user.id}`)
    return NextResponse.json(toSnakeCase(data))
  } catch (error) {
    logger.error('API Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch station records' },
      { status: 500 }
    )
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return createErrorResponse("Authentication required", 401)
    }

    // Validate request body
    const validation = await validateRequestBody(req, updateStationRecordSchema)
    if (!validation.success) {
      return validation.response
    }

    const { stationName, newTime } = validation.data

    logger.info(`Updating station record: user=${user.id}, station=${stationName}, newTime=${newTime}`)

    // First get the current record
    const currentRecordData = await withRLS((db) =>
      db.select()
        .from(hyroxStationRecords)
        .where(and(eq(hyroxStationRecords.userId, user.id), eq(hyroxStationRecords.stationName, stationName)))
        .limit(1)
    )

    if (currentRecordData.length === 0) {
      // If record doesn't exist, create it
      const defaultRecord = defaultStationRecords.find(dr => dr.stationName === stationName)
      const newRecord = {
        userId: user.id,
        stationName: stationName,
        stationType: defaultRecord?.stationType || 'exercise',
        distance: defaultRecord?.distance || '',
        bestTime: newTime,
        goalTime: defaultRecord?.goalTime || 0,
      }

      const insertedData = await withRLS((db) =>
        db.insert(hyroxStationRecords)
          .values(newRecord)
          .returning()
      )

      logger.info(`Created new record for ${stationName} with time ${newTime}`)
      return NextResponse.json(toSnakeCase(insertedData[0]))
    }

    const currentRecord = currentRecordData[0]
    logger.info(`Current best time for ${stationName}: ${currentRecord.bestTime}, new time: ${newTime}`)

    // Update if:
    // 1. Current time is 0 (no time set yet), OR
    // 2. New time is better (lower) than current
    if (currentRecord.bestTime === 0 || newTime < currentRecord.bestTime) {
      const data = await withRLS((db) =>
        db.update(hyroxStationRecords)
          .set({
            bestTime: newTime,
            updatedAt: sql`timezone('utc'::text, now())`
          })
          .where(and(eq(hyroxStationRecords.userId, user.id), eq(hyroxStationRecords.stationName, stationName)))
          .returning()
      )

      logger.info(`Updated ${stationName} from ${currentRecord.bestTime} to ${newTime}`)
      return NextResponse.json(toSnakeCase(data[0]))
    }

    logger.info(`Not updating ${stationName} - current time ${currentRecord.bestTime} is better than ${newTime}`)
    return NextResponse.json(toSnakeCase(currentRecord))
  } catch (error) {
    logger.error('API Error:', error)
    return NextResponse.json(
      { error: 'Failed to update station record' },
      { status: 500 }
    )
  }
}
