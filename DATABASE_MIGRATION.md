# Database RLS Policy Migration Guide

## Overview
This guide helps you migrate your Supabase database from Clerk-based RLS policies to native Supabase Auth RLS policies.

## Required Changes

### 1. Update RLS Policies

Your current RLS policies likely use `auth.jwt()->>'sub'` to filter by Clerk user ID. These need to be updated to use `auth.uid()` for native Supabase auth.

**Before (Clerk-based):**
```sql
CREATE POLICY "Users can only access their own tasks" ON "ari-database"
FOR ALL USING (user_email = auth.jwt()->>'email');
```

**After (Supabase Auth):**
```sql
CREATE POLICY "Users can only access their own tasks" ON "ari-database"
FOR ALL USING (user_id = auth.uid());
```

### 2. Update Table Schemas

You'll need to add a `user_id` column (UUID) to your tables and potentially migrate existing data.

**For `ari-database` table:**
```sql
-- Add user_id column if it doesn't exist
ALTER TABLE "ari-database" ADD COLUMN IF NOT EXISTS user_id UUID;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_ari_database_user_id ON "ari-database"(user_id);

-- Set default to auth.uid() for new records
ALTER TABLE "ari-database" ALTER COLUMN user_id SET DEFAULT auth.uid();
```

**For `ari-fitness-database` table:**
```sql
-- Add user_id column if it doesn't exist  
ALTER TABLE "ari-fitness-database" ADD COLUMN IF NOT EXISTS user_id UUID;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_fitness_database_user_id ON "ari-fitness-database"(user_id);

-- Set default to auth.uid() for new records
ALTER TABLE "ari-fitness-database" ALTER COLUMN user_id SET DEFAULT auth.uid();
```

### 3. Data Migration

You'll need to migrate existing user data from Clerk IDs to Supabase UUIDs:

```sql
-- This is a placeholder - you'll need to create a mapping
-- from your existing user_email to new Supabase auth.users.id

-- Example approach:
-- 1. Create users in Supabase Auth that match your existing users
-- 2. Map the email addresses to get the new UUIDs
-- 3. Update your existing records with the correct user_id

UPDATE "ari-database" 
SET user_id = (
  SELECT id FROM auth.users 
  WHERE email = "ari-database".user_email
)
WHERE user_id IS NULL;

UPDATE "ari-fitness-database"
SET user_id = (
  SELECT id FROM auth.users 
  WHERE email = "ari-fitness-database".user_email  
)
WHERE user_id IS NULL;
```

### 4. Update RLS Policies

Drop old policies and create new ones:

```sql
-- Drop existing policies
DROP POLICY IF EXISTS "existing_policy_name" ON "ari-database";
DROP POLICY IF EXISTS "existing_policy_name" ON "ari-fitness-database";

-- Create new policies for ari-database
CREATE POLICY "Users can view their own tasks" ON "ari-database"
FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own tasks" ON "ari-database"  
FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own tasks" ON "ari-database"
FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own tasks" ON "ari-database"
FOR DELETE USING (user_id = auth.uid());

-- Create new policies for ari-fitness-database
CREATE POLICY "Users can view their own fitness tasks" ON "ari-fitness-database"
FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own fitness tasks" ON "ari-fitness-database"
FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own fitness tasks" ON "ari-fitness-database"
FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own fitness tasks" ON "ari-fitness-database"
FOR DELETE USING (user_id = auth.uid());
```

### 5. Enable RLS

Ensure RLS is enabled on all tables:

```sql
ALTER TABLE "ari-database" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ari-fitness-database" ENABLE ROW LEVEL SECURITY;
```

## Testing the Migration

1. **Create a test user** in Supabase Auth Dashboard
2. **Sign in through your app** using the new auth form
3. **Test creating/reading data** to ensure RLS policies work
4. **Verify user isolation** by creating another user and ensuring they can't see each other's data

## Rollback Plan

Keep backups of:
1. Your original RLS policies
2. Your original table schemas  
3. A full database backup before migration

## Notes

- The `user_email` columns can be kept for backward compatibility but won't be needed for RLS
- All new records will automatically get the correct `user_id` due to the default value
- Test thoroughly in a staging environment before applying to production
- Consider a gradual migration approach if you have many existing users