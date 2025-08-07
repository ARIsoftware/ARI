import { supabase } from "./supabase"

export async function migrateYouTubeUrl() {
  try {
    console.log("Starting YouTube URL migration...")
    
    // Check if column already exists
    const { data: columns, error: columnsError } = await supabase
      .rpc('get_columns', { 
        table_name: 'fitness_database',
        schema_name: 'public' 
      })
      .select('*')
    
    if (columnsError) {
      // If the RPC doesn't exist, try adding the column anyway
      console.log("Could not check column existence, attempting to add column...")
    } else if (columns && columns.some((col: any) => col.column_name === 'youtube_url')) {
      console.log("youtube_url column already exists")
      return { success: true, message: "Column already exists" }
    }
    
    // Add the youtube_url column
    const { error: alterError } = await supabase.rpc('exec_sql', {
      query: `
        ALTER TABLE fitness_database 
        ADD COLUMN IF NOT EXISTS youtube_url TEXT;
      `
    })
    
    if (alterError) {
      // Try a different approach - direct SQL via Supabase admin
      console.error("Could not add column via RPC:", alterError)
      
      // Alternative: Update all existing records to have null youtube_url
      // This will only work if the column exists
      const { error: updateError } = await supabase
        .from("fitness_database")
        .update({ youtube_url: null })
        .is('youtube_url', null)
      
      if (!updateError) {
        console.log("Column appears to exist, updated null values")
        return { success: true, message: "Column exists and nulls updated" }
      }
      
      throw new Error("Failed to add youtube_url column. Please run the migration manually in Supabase dashboard.")
    }
    
    console.log("Successfully added youtube_url column to fitness_database table")
    return { success: true, message: "Migration completed successfully" }
    
  } catch (error) {
    console.error("Migration error:", error)
    return { 
      success: false, 
      message: "Migration failed. Please add 'youtube_url TEXT' column to fitness_database table in Supabase dashboard.",
      error 
    }
  }
}

// Auto-run migration when module is imported
migrateYouTubeUrl().then(result => {
  if (!result.success) {
    console.warn(`
      ⚠️  DATABASE MIGRATION REQUIRED ⚠️
      
      Please add the 'youtube_url' column to your 'fitness_database' table.
      
      Run this SQL in your Supabase dashboard:
      
      ALTER TABLE fitness_database 
      ADD COLUMN IF NOT EXISTS youtube_url TEXT;
      
      ${result.message}
    `)
  }
})