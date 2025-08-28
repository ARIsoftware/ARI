import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function GET(request: NextRequest) {
  try {
    console.log('🔍 DEBUG DB ENDPOINT - Testing raw database access')
    
    // Create basic Supabase client (no auth)
    const supabase = createClient(supabaseUrl, supabaseAnonKey)
    
    console.log('📊 Environment check:')
    console.log('   - Supabase URL:', supabaseUrl ? 'Set' : 'Missing')
    console.log('   - Supabase Key:', supabaseAnonKey ? `Set (${supabaseAnonKey.substring(0, 20)}...)` : 'Missing')
    
    // Test 1: Simple count query
    console.log('🧪 Test 1: Count all records')
    const { count, error: countError } = await supabase
      .from('ari-database')
      .select('*', { count: 'exact', head: true })
    
    console.log('   - Count error:', countError)
    console.log('   - Total records:', count)
    
    // Test 2: Get first 3 records with minimal fields
    console.log('🧪 Test 2: Get first 3 records')
    const { data: firstRecords, error: firstError } = await supabase
      .from('ari-database')
      .select('id, title, user_email, created_at')
      .limit(3)
    
    console.log('   - First records error:', firstError)
    console.log('   - First records data:', firstRecords)
    
    // Test 3: Check for noam@morpheus.network specifically
    console.log('🧪 Test 3: Filter by noam@morpheus.network')
    const { data: filteredData, error: filterError } = await supabase
      .from('ari-database')
      .select('id, title, user_email')
      .eq('user_email', 'noam@morpheus.network')
      .limit(5)
    
    console.log('   - Filtered error:', filterError)
    console.log('   - Filtered data:', filteredData)
    
    // Test 4: Get all unique user emails
    console.log('🧪 Test 4: Get all unique user emails')
    const { data: emailData, error: emailError } = await supabase
      .from('ari-database')
      .select('user_email')
      .limit(10)
    
    console.log('   - Email query error:', emailError)
    const uniqueEmails = emailData ? [...new Set(emailData.map(r => r.user_email))] : []
    console.log('   - Unique emails found:', uniqueEmails)
    
    // Test 5: Try to list all tables (this might not work with RLS but worth trying)
    console.log('🧪 Test 5: Check if table exists and try other common table names')
    
    const tableNames = ['ari-database', 'ari_database_backup', 'tasks', 'todo', 'ari_database', 'todos']
    const tableResults = {}
    
    for (const tableName of tableNames) {
      try {
        const { count: tableCount, error: tableError } = await supabase
          .from(tableName)
          .select('*', { count: 'exact', head: true })
        
        console.log(`   - Table "${tableName}":`, { error: tableError?.message || 'none', count: tableCount })
        tableResults[tableName] = { error: tableError?.message || null, count: tableCount }
      } catch (err) {
        console.log(`   - Table "${tableName}": ERROR -`, err.message)
        tableResults[tableName] = { error: err.message, count: null }
      }
    }
    
    // Test 6: Specifically test ari_database_backup (no RLS)
    console.log('🧪 Test 6: Testing ari_database_backup (no RLS)')
    let backupTableTest = {}
    
    try {
      const { count: backupCount, error: backupCountError } = await supabase
        .from('ari_database_backup')
        .select('*', { count: 'exact', head: true })
      
      console.log('   - Backup table count:', backupCount)
      console.log('   - Backup table count error:', backupCountError)
      
      const { data: backupData, error: backupDataError } = await supabase
        .from('ari_database_backup')
        .select('*')
        .limit(5)
      
      console.log('   - Backup table data:', backupData)
      console.log('   - Backup table data error:', backupDataError)
      
      backupTableTest = {
        count: backupCount,
        countError: backupCountError,
        sampleData: backupData,
        dataError: backupDataError
      }
    } catch (backupErr) {
      console.log('   - Backup table error:', backupErr.message)
      backupTableTest = { error: backupErr.message }
    }
    
    // Return comprehensive debug info
    const debugInfo = {
      environment: {
        supabaseUrl: supabaseUrl ? 'Set' : 'Missing',
        supabaseKey: supabaseAnonKey ? 'Set' : 'Missing'
      },
      tests: {
        count: { error: countError, result: count },
        firstRecords: { error: firstError, result: firstRecords },
        filteredByEmail: { error: filterError, result: filteredData },
        uniqueEmails: { error: emailError, result: uniqueEmails },
        tableExistence: tableResults,
        backupTable: backupTableTest
      }
    }
    
    console.log('✅ Debug DB endpoint completed successfully')
    return NextResponse.json(debugInfo)
    
  } catch (err) {
    console.error('❌ Debug DB error:', err)
    return NextResponse.json({ error: 'Debug failed', details: err }, { status: 500 })
  }
}