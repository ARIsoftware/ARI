import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'

export async function POST(request: NextRequest) {
  try {
    console.log('🚀 Starting data migration from backup table to main table')
    
    const { user, supabase } = await getAuthenticatedUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }
    
    // Step 1: Get all data from backup table
    console.log('📋 Step 1: Fetching all data from ari_database_backup')
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
    console.log('📋 Step 2: Transforming data to match main table schema')
    const transformedData = backupData.map(record => {
      // Create a copy without the backup-specific fields and add user_email
      const { user_ids, user_id, ...cleanRecord } = record
      return {
        ...cleanRecord,
        user_email: 'noam@morpheus.network' // Add the user email (remove user_id since main table doesn't have it)
      }
    })
    
    console.log(`✅ Transformed ${transformedData.length} records with user_email`)
    
    // Step 3: Clear existing data in main table (just in case)
    console.log('📋 Step 3: Clearing main table')
    const { error: deleteError } = await supabase
      .from('ari-database')
      .delete()
      .neq('id', 'impossible-id') // Delete all records
    
    if (deleteError) {
      console.log('⚠️ Warning: Could not clear main table (might be empty):', deleteError.message)
    }
    
    // Step 4: Insert transformed data into main table
    console.log('📋 Step 4: Inserting data into main table')
    const { data: insertedData, error: insertError } = await supabase
      .from('ari-database')
      .insert(transformedData)
      .select()
    
    if (insertError) {
      console.error('❌ Error inserting data:', insertError)
      return NextResponse.json({ error: 'Failed to insert data', details: insertError }, { status: 500 })
    }
    
    console.log(`✅ Successfully migrated ${insertedData?.length || 0} records`)
    
    // Step 5: Verify the migration
    console.log('📋 Step 5: Verifying migration')
    const { count: finalCount, error: countError } = await supabase
      .from('ari-database')
      .select('*', { count: 'exact', head: true })
    
    if (countError) {
      console.log('⚠️ Warning: Could not verify count:', countError.message)
    } else {
      console.log(`✅ Final count in main table: ${finalCount}`)
    }
    
    return NextResponse.json({
      success: true,
      message: `Successfully migrated ${insertedData?.length || 0} records`,
      backupRecords: backupData?.length || 0,
      migratedRecords: insertedData?.length || 0,
      finalCount: finalCount
    })
    
  } catch (err) {
    console.error('❌ Migration error:', err)
    return NextResponse.json({ error: 'Migration failed', details: err }, { status: 500 })
  }
}