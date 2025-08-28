# Specific RLS Migration Commands for ARI Database

Based on your actual table schema, here are the exact commands you need to run.

## Your Tables Overview
From your screenshot, I can see these main tables need RLS policies:
- ✅ **ari-database** (main tasks table)
- ✅ **fitness_database** (fitness tasks)  
- ✅ **contacts** (contacts management)
- ✅ **goals** (goals tracking)
- ✅ **hyrox_station_records**, **hyrox_workout_stations**, **hyrox_workouts** (hyrox system)
- ✅ **fitness_completion_history** (completion tracking)

Note: Tables marked "Unrestricted" are backup tables and should stay that way.

## Step 2: Add user_id Column to ari-database

```sql
-- Add user_id column with foreign key constraint
ALTER TABLE "ari-database" 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Create index for performance (matching your existing index pattern)
CREATE INDEX IF NOT EXISTS idx_ari_database_user_id 
ON "ari-database" USING btree (user_id) TABLESPACE pg_default;

-- Set default value for new records
ALTER TABLE "ari-database" 
ALTER COLUMN user_id SET DEFAULT auth.uid();
```

## Step 3: Migrate Existing Data

### 3.1: Check your current user emails
```sql
-- See what user emails exist in your ari-database
SELECT DISTINCT user_email, COUNT(*) as record_count
FROM "ari-database" 
WHERE user_email IS NOT NULL
GROUP BY user_email
ORDER BY user_email;
```

### 3.2: Check Supabase Auth users
```sql
-- See what users exist in Supabase Auth
SELECT id, email, created_at 
FROM auth.users 
ORDER BY email;
```

### 3.3: Migrate the data
```sql
-- Update ari-database records with correct user_id
UPDATE "ari-database" 
SET user_id = (
    SELECT id 
    FROM auth.users 
    WHERE email = "ari-database".user_email
)
WHERE user_id IS NULL 
AND user_email IS NOT NULL;

-- Check the migration results
SELECT 
    COUNT(*) as total_records,
    COUNT(user_id) as records_with_user_id,
    COUNT(user_email) as records_with_email,
    COUNT(*) - COUNT(user_id) as records_missing_user_id
FROM "ari-database";
```

## Step 4: Drop Old Policies

Based on your screenshot, you have these policies to drop:

```sql
-- Drop the existing Authenticated Users Only policy
DROP POLICY IF EXISTS "Authenticated Users Only" ON "ari-database";
```

## Step 5: Create New Supabase Auth Policies

```sql
-- Enable RLS (probably already enabled, but just to be sure)
ALTER TABLE "ari-database" ENABLE ROW LEVEL SECURITY;

-- CREATE policies using auth.uid()
CREATE POLICY "Users can view their own tasks" ON "ari-database"
FOR SELECT 
USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own tasks" ON "ari-database"
FOR INSERT 
WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "Users can update their own tasks" ON "ari-database"
FOR UPDATE 
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own tasks" ON "ari-database"
FOR DELETE 
USING (user_id = auth.uid());
```

## Step 6: Test the Migration

```sql
-- Verify the new policies are in place
SELECT tablename, policyname, permissive, cmd, 
       pg_get_expr(polqual, polrelid::regclass) as using_clause
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename = 'ari-database'
ORDER BY policyname;

-- Test that user_id values are properly set
SELECT user_email, user_id, COUNT(*) as record_count
FROM "ari-database"
GROUP BY user_email, user_id
ORDER BY user_email;

-- Check for any records still missing user_id
SELECT id, title, user_email, user_id 
FROM "ari-database" 
WHERE user_id IS NULL 
LIMIT 10;
```

## Step 7: Handle Records Missing user_id (if any)

If you have records without user_id after the migration:

```sql
-- Option 1: Delete orphaned records (CAUTION: This deletes data!)
-- DELETE FROM "ari-database" WHERE user_id IS NULL;

-- Option 2: Check if these are from non-existent users
SELECT DISTINCT user_email 
FROM "ari-database" 
WHERE user_id IS NULL 
AND user_email IS NOT NULL;

-- Then either create those users in Supabase Auth or decide what to do with the data
```

## Important Notes for Your Schema

1. **Keep user_email column**: Don't drop it yet - you might need it for reference
2. **Your existing indexes**: All your current indexes will continue to work
3. **Default values**: The `auth.uid()` default will automatically set user_id for new records
4. **Data integrity**: The foreign key constraint ensures user_id always points to valid auth users

## Quick Verification Test

After completing the migration, test with this:

```sql
-- This should show your policies are working
SELECT auth.uid() as current_user_id;

-- This should only show data for the current user (when run from your app)
SELECT COUNT(*) as my_task_count FROM "ari-database";
```

Run these commands in order, and your `ari-database` table will be fully migrated to use native Supabase Auth!