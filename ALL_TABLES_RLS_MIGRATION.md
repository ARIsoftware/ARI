# Complete RLS Migration for All ARI Tables

Based on your table list, here's the complete migration for all your main tables.

## Tables to Migrate (With RLS Policies)
- `ari-database` (main tasks)
- `fitness_database` (fitness tasks)
- `contacts` (contact management)
- `goals` (goals tracking)
- `hyrox_station_records` (hyrox records)
- `hyrox_workout_stations` (hyrox stations)
- `hyrox_workouts` (hyrox workouts)
- `fitness_completion_history` (completion tracking)

## Step 1: Add user_id Columns to All Tables

```sql
-- Add user_id columns with foreign key constraints
ALTER TABLE "ari-database" 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

ALTER TABLE fitness_database 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

ALTER TABLE contacts 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

ALTER TABLE goals 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

ALTER TABLE hyrox_station_records 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

ALTER TABLE hyrox_workout_stations 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

ALTER TABLE hyrox_workouts 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

ALTER TABLE fitness_completion_history 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
```

## Step 2: Create Performance Indexes

```sql
-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_ari_database_user_id 
ON "ari-database" USING btree (user_id);

CREATE INDEX IF NOT EXISTS idx_fitness_database_user_id 
ON fitness_database USING btree (user_id);

CREATE INDEX IF NOT EXISTS idx_contacts_user_id 
ON contacts USING btree (user_id);

CREATE INDEX IF NOT EXISTS idx_goals_user_id 
ON goals USING btree (user_id);

CREATE INDEX IF NOT EXISTS idx_hyrox_station_records_user_id 
ON hyrox_station_records USING btree (user_id);

CREATE INDEX IF NOT EXISTS idx_hyrox_workout_stations_user_id 
ON hyrox_workout_stations USING btree (user_id);

CREATE INDEX IF NOT EXISTS idx_hyrox_workouts_user_id 
ON hyrox_workouts USING btree (user_id);

CREATE INDEX IF NOT EXISTS idx_fitness_completion_history_user_id 
ON fitness_completion_history USING btree (user_id);
```

## Step 3: Set Default Values

```sql
-- Set default user_id for new records
ALTER TABLE "ari-database" 
ALTER COLUMN user_id SET DEFAULT auth.uid();

ALTER TABLE fitness_database 
ALTER COLUMN user_id SET DEFAULT auth.uid();

ALTER TABLE contacts 
ALTER COLUMN user_id SET DEFAULT auth.uid();

ALTER TABLE goals 
ALTER COLUMN user_id SET DEFAULT auth.uid();

ALTER TABLE hyrox_station_records 
ALTER COLUMN user_id SET DEFAULT auth.uid();

ALTER TABLE hyrox_workout_stations 
ALTER COLUMN user_id SET DEFAULT auth.uid();

ALTER TABLE hyrox_workouts 
ALTER COLUMN user_id SET DEFAULT auth.uid();

ALTER TABLE fitness_completion_history 
ALTER COLUMN user_id SET DEFAULT auth.uid();
```

## Step 4: Check Current User Data

```sql
-- Check what users exist in each table
SELECT 'ari-database' as table_name, DISTINCT user_email, COUNT(*) 
FROM "ari-database" WHERE user_email IS NOT NULL 
GROUP BY user_email

UNION ALL

SELECT 'fitness_database' as table_name, DISTINCT user_email, COUNT(*) 
FROM fitness_database WHERE user_email IS NOT NULL 
GROUP BY user_email

UNION ALL

SELECT 'contacts' as table_name, DISTINCT user_email, COUNT(*) 
FROM contacts WHERE user_email IS NOT NULL 
GROUP BY user_email

UNION ALL

SELECT 'goals' as table_name, DISTINCT user_email, COUNT(*) 
FROM goals WHERE user_email IS NOT NULL 
GROUP BY user_email

ORDER BY table_name, user_email;
```

## Step 5: Migrate Existing Data

```sql
-- Update all tables with correct user_id from auth.users
UPDATE "ari-database" 
SET user_id = (SELECT id FROM auth.users WHERE email = "ari-database".user_email)
WHERE user_id IS NULL AND user_email IS NOT NULL;

UPDATE fitness_database 
SET user_id = (SELECT id FROM auth.users WHERE email = fitness_database.user_email)
WHERE user_id IS NULL AND user_email IS NOT NULL;

UPDATE contacts 
SET user_id = (SELECT id FROM auth.users WHERE email = contacts.user_email)
WHERE user_id IS NULL AND user_email IS NOT NULL;

UPDATE goals 
SET user_id = (SELECT id FROM auth.users WHERE email = goals.user_email)
WHERE user_id IS NULL AND user_email IS NOT NULL;

-- For hyrox tables (if they have user_email columns)
UPDATE hyrox_station_records 
SET user_id = (SELECT id FROM auth.users WHERE email = hyrox_station_records.user_email)
WHERE user_id IS NULL AND user_email IS NOT NULL;

UPDATE hyrox_workout_stations 
SET user_id = (SELECT id FROM auth.users WHERE email = hyrox_workout_stations.user_email)
WHERE user_id IS NULL AND user_email IS NOT NULL;

UPDATE hyrox_workouts 
SET user_id = (SELECT id FROM auth.users WHERE email = hyrox_workouts.user_email)
WHERE user_id IS NULL AND user_email IS NOT NULL;

UPDATE fitness_completion_history 
SET user_id = (SELECT id FROM auth.users WHERE email = fitness_completion_history.user_email)
WHERE user_id IS NULL AND user_email IS NOT NULL;
```

## Step 6: Drop Old Policies (Run First Query to See Current Policies)

```sql
-- First, see what policies exist
SELECT tablename, policyname, cmd
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename IN (
  'ari-database', 
  'fitness_database', 
  'contacts', 
  'goals',
  'hyrox_station_records',
  'hyrox_workout_stations', 
  'hyrox_workouts',
  'fitness_completion_history'
)
ORDER BY tablename, policyname;
```

Based on the results above, you'll need to drop the existing policies. Common ones to drop:

```sql
-- Drop existing policies (adjust names based on Step 6 query results)
DROP POLICY IF EXISTS "Authenticated Users Only" ON "ari-database";
DROP POLICY IF EXISTS "Allow all operations on contacts" ON contacts;
DROP POLICY IF EXISTS "Authenticated users can manage contacts" ON contacts;
-- Add more DROP statements based on your query results
```

## Step 7: Create New RLS Policies for All Tables

### Enable RLS on all tables
```sql
ALTER TABLE "ari-database" ENABLE ROW LEVEL SECURITY;
ALTER TABLE fitness_database ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE hyrox_station_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE hyrox_workout_stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE hyrox_workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE fitness_completion_history ENABLE ROW LEVEL SECURITY;
```

### Create policies for ari-database
```sql
CREATE POLICY "Users can view their own tasks" ON "ari-database"
FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own tasks" ON "ari-database"
FOR INSERT WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "Users can update their own tasks" ON "ari-database"
FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own tasks" ON "ari-database"
FOR DELETE USING (user_id = auth.uid());
```

### Create policies for fitness_database
```sql
CREATE POLICY "Users can view their own fitness tasks" ON fitness_database
FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own fitness tasks" ON fitness_database
FOR INSERT WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "Users can update their own fitness tasks" ON fitness_database
FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own fitness tasks" ON fitness_database
FOR DELETE USING (user_id = auth.uid());
```

### Create policies for contacts
```sql
CREATE POLICY "Users can view their own contacts" ON contacts
FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own contacts" ON contacts
FOR INSERT WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "Users can update their own contacts" ON contacts
FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own contacts" ON contacts
FOR DELETE USING (user_id = auth.uid());
```

### Create policies for goals
```sql
CREATE POLICY "Users can view their own goals" ON goals
FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own goals" ON goals
FOR INSERT WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "Users can update their own goals" ON goals
FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own goals" ON goals
FOR DELETE USING (user_id = auth.uid());
```

### Create policies for hyrox tables
```sql
-- Hyrox station records
CREATE POLICY "Users can view their own hyrox records" ON hyrox_station_records
FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own hyrox records" ON hyrox_station_records
FOR INSERT WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "Users can update their own hyrox records" ON hyrox_station_records
FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own hyrox records" ON hyrox_station_records
FOR DELETE USING (user_id = auth.uid());

-- Hyrox workout stations
CREATE POLICY "Users can view their own workout stations" ON hyrox_workout_stations
FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own workout stations" ON hyrox_workout_stations
FOR INSERT WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "Users can update their own workout stations" ON hyrox_workout_stations
FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own workout stations" ON hyrox_workout_stations
FOR DELETE USING (user_id = auth.uid());

-- Hyrox workouts
CREATE POLICY "Users can view their own hyrox workouts" ON hyrox_workouts
FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own hyrox workouts" ON hyrox_workouts
FOR INSERT WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "Users can update their own hyrox workouts" ON hyrox_workouts
FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own hyrox workouts" ON hyrox_workouts
FOR DELETE USING (user_id = auth.uid());
```

### Create policies for fitness_completion_history
```sql
CREATE POLICY "Users can view their own completion history" ON fitness_completion_history
FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own completion history" ON fitness_completion_history
FOR INSERT WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "Users can update their own completion history" ON fitness_completion_history
FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own completion history" ON fitness_completion_history
FOR DELETE USING (user_id = auth.uid());
```

## Step 8: Verify Migration

```sql
-- Check that all tables have user_id columns and indexes
SELECT 
    t.table_name,
    c.column_name,
    c.data_type,
    c.is_nullable
FROM information_schema.tables t
LEFT JOIN information_schema.columns c ON t.table_name = c.table_name 
WHERE t.table_schema = 'public' 
AND t.table_name IN (
  'ari-database', 'fitness_database', 'contacts', 'goals',
  'hyrox_station_records', 'hyrox_workout_stations', 'hyrox_workouts',
  'fitness_completion_history'
)
AND c.column_name = 'user_id'
ORDER BY t.table_name;

-- Check that policies are created
SELECT tablename, policyname, permissive, cmd
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename IN (
  'ari-database', 'fitness_database', 'contacts', 'goals',
  'hyrox_station_records', 'hyrox_workout_stations', 'hyrox_workouts', 
  'fitness_completion_history'
)
ORDER BY tablename, policyname;
```

## Important Notes

1. **Backup tables**: Leave all `*_backup` tables as "Unrestricted" - they should bypass RLS for backup purposes
2. **Test thoroughly**: After migration, test with different user accounts to ensure data isolation
3. **user_email columns**: Keep them for now - you can remove them later once everything is working
4. **Performance**: The new indexes will ensure fast queries on user_id

This migration will secure all your main application tables with proper user isolation using Supabase Auth!