import { supabase } from "./supabase"

// Simple test function to check database connectivity
export async function testFitnessDatabase() {
  console.log("Testing fitness database connection...")
  
  try {
    // Test 1: Basic connection test
    console.log("Test 1: Checking if table exists...")
    const { data: tables, error: tableError } = await supabase
      .from("fitness_database")
      .select("count", { count: "exact", head: true })
    
    if (tableError) {
      console.error("Table access error:", tableError)
      return false
    }
    
    console.log("Table exists, record count:", tables)
    
    // Test 2: Try to select all records
    console.log("Test 2: Selecting all records...")
    const { data, error } = await supabase
      .from("fitness_database")
      .select("*")
    
    if (error) {
      console.error("Select error:", error)
      return false
    }
    
    console.log("Successfully retrieved records:", data)
    
    // Test 3: Try to insert a test record
    console.log("Test 3: Trying to insert a test record...")
    const testTask = {
      title: "Test Exercise - DELETE ME",
      assignees: ["Test User"],
      due_date: new Date().toISOString().split('T')[0],
      subtasks_completed: 0,
      subtasks_total: 1,
      status: "Pending" as const,
      priority: "Low" as const,
      starred: false,
      completed: false,
      order_index: 999
    }
    
    const { data: insertData, error: insertError } = await supabase
      .from("fitness_database")
      .insert([testTask])
      .select()
      .single()
    
    if (insertError) {
      console.error("Insert error:", insertError)
      return false
    }
    
    console.log("Successfully inserted test record:", insertData)
    
    // Clean up: Delete the test record
    if (insertData) {
      const { error: deleteError } = await supabase
        .from("fitness_database")
        .delete()
        .eq("id", insertData.id)
      
      if (deleteError) {
        console.warn("Could not delete test record:", deleteError)
      } else {
        console.log("Test record cleaned up successfully")
      }
    }
    
    return true
    
  } catch (error) {
    console.error("Database test failed:", error)
    return false
  }
}
