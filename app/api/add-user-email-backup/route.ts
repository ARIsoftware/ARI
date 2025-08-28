import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function POST(request: NextRequest) {
  try {
    console.log('🚀 Adding user_email column to backup table')
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey)
    
    // Note: This will only work if RLS allows DDL operations
    // You might need to run the SQL commands manually in Supabase Dashboard
    
    console.log('📋 Step 1: Adding user_email column')
    // This might fail due to RLS restrictions on DDL operations
    const { error: alterError } = await supabase.rpc('exec_sql', {
      sql: 'ALTER TABLE ari_database_backup ADD COLUMN IF NOT EXISTS user_email TEXT'
    })
    
    if (alterError) {
      console.log('⚠️ Cannot add column via API (expected):', alterError.message)
      return NextResponse.json({
        error: 'Cannot modify table schema via API',
        message: 'Please run these SQL commands manually in Supabase Dashboard:',
        sqlCommands: [
          'ALTER TABLE ari_database_backup ADD COLUMN user_email TEXT;',
          "UPDATE ari_database_backup SET user_email = 'hello@ari.software' WHERE user_email IS NULL;",
          'ALTER TABLE ari_database_backup ALTER COLUMN user_email SET NOT NULL;'
        ]
      }, { status: 400 })
    }
    
    console.log('📋 Step 2: Populating user_email column')
    const { error: updateError } = await supabase
      .from('ari_database_backup')
      .update({ user_email: 'hello@ari.software' })
      .is('user_email', null)
    
    if (updateError) {
      console.error('❌ Error updating backup table:', updateError)
      return NextResponse.json({ error: 'Failed to update user_email', details: updateError }, { status: 500 })
    }
    
    console.log('✅ Successfully added and populated user_email column')
    return NextResponse.json({ success: true, message: 'user_email column added and populated' })
    
  } catch (err) {
    console.error('❌ Error:', err)
    return NextResponse.json({ error: 'Operation failed', details: err }, { status: 500 })
  }
}