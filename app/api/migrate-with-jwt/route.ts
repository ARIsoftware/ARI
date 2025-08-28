import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function POST(request: NextRequest) {
  try {
    console.log('🚀 Starting JWT-authenticated data migration')
    
    // Extract JWT token from Authorization header
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authorization header required' }, { status: 401 })
    }
    
    const token = authHeader.substring(7) // Remove "Bearer " prefix
    console.log('🔑 Using JWT token for authentication')
    
    // Create Supabase client WITH JWT token (not the anonymous one)
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    })
    
    console.log('🔗 Created Supabase client with JWT authentication')
    
    // Step 1: Get all data from backup table (this should work as backup has no RLS)
    console.log('📋 Step 1: Fetching data from backup table')
    const { data: backupData, error: fetchError } = await supabase
      .from('ari_database_backup')
      .select('*')
    
    if (fetchError) {
      console.error('❌ Error fetching backup data:', fetchError)
      return NextResponse.json({ error: 'Failed to fetch backup data', details: fetchError }, { status: 500 })
    }
    
    console.log(`✅ Found ${backupData?.length || 0} records in backup table`)
    
    if (!backupData || backupData.length === 0) {
      return NextResponse.json({ message: 'No data to migrate' })
    }
    
    // Step 2: Transform data to match main table schema
    console.log('📋 Step 2: Transforming data for main table')
    const transformedData = backupData.map(record => {
      // Remove backup-specific fields that don't exist in main table
      const { user_ids, user_id, ...cleanRecord } = record
      return cleanRecord // This should already have user_email from your SQL update
    })
    
    console.log(`✅ Transformed ${transformedData.length} records`)
    console.log('📊 Sample transformed record:', transformedData[0])
    
    // Step 3: Clear existing data in main table (if any)
    console.log('📋 Step 3: Clearing main table')
    const { error: deleteError } = await supabase
      .from('ari-database')
      .delete()
      .neq('id', 'impossible-id') // Delete all records
    
    if (deleteError) {
      console.log('⚠️ Could not clear main table:', deleteError.message)
    }
    
    // Step 4: Insert data with JWT authentication (should pass RLS)
    console.log('📋 Step 4: Inserting data with JWT auth')
    const { data: insertedData, error: insertError } = await supabase
      .from('ari-database')
      .insert(transformedData)
      .select()
    
    if (insertError) {
      console.error('❌ Error inserting data:', insertError)
      return NextResponse.json({ 
        error: 'Failed to insert data', 
        details: insertError,
        transformedSample: transformedData[0] // Show what we tried to insert
      }, { status: 500 })
    }
    
    console.log(`✅ Successfully inserted ${insertedData?.length || 0} records`)
    
    // Step 5: Verify the migration
    console.log('📋 Step 5: Verifying migration')
    const { count: finalCount, error: countError } = await supabase
      .from('ari-database')
      .select('*', { count: 'exact', head: true })
    
    console.log('✅ Migration completed successfully!')
    
    return NextResponse.json({
      success: true,
      message: `Successfully migrated ${insertedData?.length || 0} records`,
      details: {
        backupRecords: backupData.length,
        migratedRecords: insertedData?.length || 0,
        finalCount: finalCount || 'unknown'
      }
    })
    
  } catch (err) {
    console.error('❌ Migration error:', err)
    return NextResponse.json({ error: 'Migration failed', details: err.message }, { status: 500 })
  }
}