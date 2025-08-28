# Step-by-Step RLS Policy Migration Guide

## Prerequisites
- Access to your Supabase Dashboard
- Database admin privileges
- Backup of your current database (STRONGLY RECOMMENDED)

## Step 1: Backup Current Policies

Before making any changes, document your current RLS policies.

### 1.1: View Current Policies
```sql
-- See all current policies
SELECT 
    schemaname, 
    tablename, 
    policyname, 
    permissive, 
    roles, 
    cmd, 
    qual,
    with_check
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

### 1.2: Save Policy Definitions
Run this to get the exact CREATE POLICY statements:
```sql
-- Get exact policy definitions for backup
SELECT 
    'DROP POLICY IF EXISTS "' || policyname || '" ON "' || tablename || '";' as drop_statement,
    pg_get_expr(qual, c.oid) as policy_definition
FROM pg_policy p
JOIN pg_class c ON p.polrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public'
ORDER BY c.relname, p.polname;
```

**Save these results** - you'll need them for rollback if something goes wrong.

## Step 2: Add user_id Columns

Your tables need `user_id` columns to work with Supabase Auth.

### 2.1: Check Current Table Structure
```sql
-- Check current columns in ari-database
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'ari-database';

-- Check current columns in ari-fitness-database  
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'ari-fitness-database';
```

### 2.2: Add user_id Columns
```sql
-- Add user_id to ari-database table
ALTER TABLE "ari-database" 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Add user_id to ari-fitness-database table
ALTER TABLE "ari-fitness-database" 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_ari_database_user_id 
ON "ari-database"(user_id);

CREATE INDEX IF NOT EXISTS idx_fitness_database_user_id 
ON "ari-fitness-database"(user_id);
```

### 2.3: Set Default Values for New Records
```sql
-- Set default user_id to current authenticated user for new records
ALTER TABLE "ari-database" 
ALTER COLUMN user_id SET DEFAULT auth.uid();

ALTER TABLE "ari-fitness-database" 
ALTER COLUMN user_id SET DEFAULT auth.uid();
```

## Step 3: Migrate Existing Data

You need to map your existing user_email data to Supabase auth user IDs.

### 3.1: Check Current User Data
```sql
-- See what user emails exist in your data
SELECT DISTINCT user_email 
FROM "ari-database" 
WHERE user_email IS NOT NULL
ORDER BY user_email;

SELECT DISTINCT user_email 
FROM "ari-fitness-database" 
WHERE user_email IS NOT NULL  
ORDER BY user_email;
```

### 3.2: Check Supabase Auth Users
```sql
-- See what users exist in Supabase Auth
SELECT id, email, created_at 
FROM auth.users 
ORDER BY email;
```

### 3.3: Create User Mapping (CRITICAL STEP)

**Option A: If you have matching emails**
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

-- Update ari-fitness-database records with correct user_id
UPDATE "ari-fitness-database" 
SET user_id = (
    SELECT id 
    FROM auth.users 
    WHERE email = "ari-fitness-database".user_email
)
WHERE user_id IS NULL 
AND user_email IS NOT NULL;
```

**Option B: If you need to create users first**

If your existing users don't exist in Supabase Auth yet, you have two choices:

1. **Have users sign up again** (simplest but requires user action)
2. **Create users programmatically** (requires admin API key)

For Option 2, use the Supabase Admin API or create a migration script.

### 3.4: Verify Data Migration
```sql
-- Check how many records now have user_id
SELECT 
    COUNT(*) as total_records,
    COUNT(user_id) as records_with_user_id,
    COUNT(*) - COUNT(user_id) as records_missing_user_id
FROM "ari-database";

SELECT 
    COUNT(*) as total_records,
    COUNT(user_id) as records_with_user_id,
    COUNT(*) - COUNT(user_id) as records_missing_user_id
FROM "ari-fitness-database";

-- See any records still missing user_id
SELECT * FROM "ari-database" WHERE user_id IS NULL LIMIT 5;
SELECT * FROM "ari-fitness-database" WHERE user_id IS NULL LIMIT 5;
```

## Step 4: Drop Old Policies

Remove your current Clerk-based policies.

### 4.1: Identify Current Policies
```sql
-- List all current policies to see what needs to be dropped
SELECT tablename, policyname, cmd
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename IN ('ari-database', 'ari-fitness-database');
```

### 4.2: Drop Existing Policies
Replace `your_policy_name` with the actual policy names from Step 4.1:

```sql
-- Drop policies on ari-database
DROP POLICY IF EXISTS "your_policy_name_1" ON "ari-database";
DROP POLICY IF EXISTS "your_policy_name_2" ON "ari-database";
-- Add more DROP statements as needed

-- Drop policies on ari-fitness-database  
DROP POLICY IF EXISTS "your_policy_name_1" ON "ari-fitness-database";
DROP POLICY IF EXISTS "your_policy_name_2" ON "ari-fitness-database";
-- Add more DROP statements as needed
```

## Step 5: Create New Supabase Auth Policies

Create comprehensive RLS policies using `auth.uid()`.

### 5.1: Policies for ari-database
```sql
-- Enable RLS if not already enabled
ALTER TABLE "ari-database" ENABLE ROW LEVEL SECURITY;

-- SELECT policy - users can view their own tasks
CREATE POLICY "Users can view their own tasks" ON "ari-database"
FOR SELECT 
USING (user_id = auth.uid());

-- INSERT policy - users can create tasks (user_id will be auto-set)
CREATE POLICY "Users can insert their own tasks" ON "ari-database"
FOR INSERT 
WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

-- UPDATE policy - users can update their own tasks
CREATE POLICY "Users can update their own tasks" ON "ari-database"
FOR UPDATE 
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- DELETE policy - users can delete their own tasks
CREATE POLICY "Users can delete their own tasks" ON "ari-database"
FOR DELETE 
USING (user_id = auth.uid());
```

### 5.2: Policies for ari-fitness-database
```sql
-- Enable RLS if not already enabled
ALTER TABLE "ari-fitness-database" ENABLE ROW LEVEL SECURITY;

-- SELECT policy - users can view their own fitness tasks
CREATE POLICY "Users can view their own fitness tasks" ON "ari-fitness-database"
FOR SELECT 
USING (user_id = auth.uid());

-- INSERT policy - users can create fitness tasks
CREATE POLICY "Users can insert their own fitness tasks" ON "ari-fitness-database"
FOR INSERT 
WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

-- UPDATE policy - users can update their own fitness tasks
CREATE POLICY "Users can update their own fitness tasks" ON "ari-fitness-database"
FOR UPDATE 
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- DELETE policy - users can delete their own fitness tasks
CREATE POLICY "Users can delete their own fitness tasks" ON "ari-fitness-database"
FOR DELETE 
USING (user_id = auth.uid());
```

## Step 6: Test the New Policies

Critical testing to ensure everything works correctly.

### 6.1: Test with SQL
```sql
-- Test that policies are active
SELECT tablename, policyname, permissive, cmd, qual
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename IN ('ari-database', 'ari-fitness-database')
ORDER BY tablename, policyname;
```

### 6.2: Test with Different Users

1. **Sign up a new user** through your app
2. **Create some test data** through your app
3. **Switch to another user** and verify they can't see the first user's data
4. **Try API calls** to ensure they work correctly

### 6.3: SQL Testing with Different User Context
```sql
-- Test as a specific user (replace with actual user ID)
SELECT set_config('request.jwt.claims', '{"sub":"USER_ID_HERE"}', true);

-- This should now only show that user's data
SELECT * FROM "ari-database" LIMIT 5;
SELECT * FROM "ari-fitness-database" LIMIT 5;

-- Reset context
SELECT set_config('request.jwt.claims', '', true);
```

## Step 7: Verify Everything Works

### 7.1: App Testing Checklist
- [ ] **Sign up** creates new user and allows access
- [ ] **Sign in** works for existing users  
- [ ] **Dashboard** shows only user's own data
- [ ] **Create task** works and shows in user's list
- [ ] **Edit task** works for user's own tasks
- [ ] **Delete task** works for user's own tasks
- [ ] **Different users** can't see each other's data
- [ ] **Sign out** works correctly

### 7.2: Performance Check
```sql
-- Ensure indexes are being used
EXPLAIN (ANALYZE, BUFFERS) 
SELECT * FROM "ari-database" WHERE user_id = 'some-uuid-here';

EXPLAIN (ANALYZE, BUFFERS) 
SELECT * FROM "ari-fitness-database" WHERE user_id = 'some-uuid-here';
```

## Troubleshooting Common Issues

### Issue: "Records missing user_id"
**Solution:** Some old records weren't migrated. Either:
- Delete orphaned records: `DELETE FROM "ari-database" WHERE user_id IS NULL;`
- Or assign to a default user (not recommended for security)

### Issue: "Users can't access their data"
**Check:**
1. Is the user signed in? `SELECT auth.uid();` should return a UUID
2. Do the user_id values match? `SELECT user_id FROM "ari-database" LIMIT 1;`
3. Are policies enabled? Check Step 6.1

### Issue: "Policies too restrictive"
**Solutions:**
- For INSERT policies, ensure `user_id IS NULL` is allowed (it gets set by default)
- For service roles, create separate policies with `TO service_role`

### Issue: "Performance problems"
**Solutions:**
- Ensure indexes exist on user_id columns (Step 2.2)
- Consider composite indexes: `CREATE INDEX ON "ari-database"(user_id, created_at);`

## Rollback Plan (If Something Goes Wrong)

### Emergency Rollback Steps
1. **Disable RLS temporarily:**
```sql
ALTER TABLE "ari-database" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "ari-fitness-database" DISABLE ROW LEVEL SECURITY;
```

2. **Restore old policies** using the backup from Step 1.2

3. **Remove user_id columns if needed:**
```sql
ALTER TABLE "ari-database" DROP COLUMN IF EXISTS user_id;
ALTER TABLE "ari-fitness-database" DROP COLUMN IF EXISTS user_id;
```

## Summary

After completing these steps:
1. ✅ Old Clerk-based policies removed
2. ✅ New `user_id` columns added with proper indexes  
3. ✅ Existing data mapped to Supabase auth users
4. ✅ New RLS policies using `auth.uid()` created
5. ✅ Comprehensive testing completed

Your database will now work seamlessly with the migrated Supabase Auth codebase!