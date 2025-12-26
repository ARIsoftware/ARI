-- ============================================
-- Migration 002: Replace RLS Policies on All User-Scoped Tables
-- ============================================
--
-- PURPOSE:
-- Replace existing RLS policies (which use Supabase's auth.uid()) with
-- portable policies using app.current_user_id().
--
-- PRE-REQUISITE:
-- Run migration 001-portable-rls-setup.sql first!
--
-- IMPORTANT: Type Casting
-- - app.current_user_id() returns TEXT
-- - user_id columns are UUID
-- - We use ::uuid to explicitly cast TEXT to UUID
--
-- WHAT THIS DOES:
-- 1. Drops ALL existing RLS policies on user-scoped tables
-- 2. Enables RLS and FORCE RLS on each table
-- 3. Creates new policies using app.current_user_id()::uuid
--
-- TABLES AFFECTED (26 user-scoped tables):
-- Core: tasks, contacts, northstar, journal, notepad, notepad_revisions
-- Fitness: fitness_database, fitness_completion_history
-- HYROX: hyrox_workouts, hyrox_workout_stations, hyrox_station_records
-- Modules: motivation_content, shipments, winter_arc_goals, contribution_graph,
--          user_feature_preferences, hello_world_entries, module_settings,
--          major_projects, quotes, travel, travel_activities, ohtani_grid_cells,
--          gratitude_entries
-- Knowledge: knowledge_articles, knowledge_collections
--
-- NOT AFFECTED:
-- - module_migrations (system table, no user_id)
-- - Better Auth tables (handled in migration 003)
--
-- IMPORTANT NOTES:
-- - INSERT operations require the application to set user_id explicitly!
-- - RLS only VALIDATES that user_id matches current_user_id, it does NOT auto-populate
-- - FORCE ROW LEVEL SECURITY ensures RLS applies even to table owners
--
-- ============================================


-- ============================================
-- PRE-FLIGHT: Discover Existing Policies
-- ============================================
-- Run this query FIRST to see all existing policies.
-- This helps verify we're dropping the right ones.
--
-- Copy the output and verify all policies will be dropped.

/*
SELECT
  tablename,
  policyname,
  cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
*/

-- To auto-generate DROP statements for your database:
/*
SELECT
  'DROP POLICY IF EXISTS "' || policyname || '" ON ' || tablename || ';'
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
*/


-- ============================================
-- SECTION 1: CORE TABLES
-- ============================================

-- --------------------------------------------
-- tasks
-- --------------------------------------------
DROP POLICY IF EXISTS "Enable all operations for authenticated users" ON tasks;
DROP POLICY IF EXISTS "Users can only see their own tasks" ON tasks;
DROP POLICY IF EXISTS "Users can insert their own tasks" ON tasks;
DROP POLICY IF EXISTS "Users can update their own tasks" ON tasks;
DROP POLICY IF EXISTS "Users can delete their own tasks" ON tasks;
DROP POLICY IF EXISTS "tasks_select" ON tasks;
DROP POLICY IF EXISTS "tasks_insert" ON tasks;
DROP POLICY IF EXISTS "tasks_update" ON tasks;
DROP POLICY IF EXISTS "tasks_delete" ON tasks;

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks FORCE ROW LEVEL SECURITY;

CREATE POLICY "tasks_select" ON tasks FOR SELECT
  USING (user_id = app.current_user_id()::uuid);
CREATE POLICY "tasks_insert" ON tasks FOR INSERT
  WITH CHECK (user_id = app.current_user_id()::uuid);
CREATE POLICY "tasks_update" ON tasks FOR UPDATE
  USING (user_id = app.current_user_id()::uuid)
  WITH CHECK (user_id = app.current_user_id()::uuid);
CREATE POLICY "tasks_delete" ON tasks FOR DELETE
  USING (user_id = app.current_user_id()::uuid);


-- --------------------------------------------
-- contacts
-- --------------------------------------------
DROP POLICY IF EXISTS "Enable all operations for authenticated users" ON contacts;
DROP POLICY IF EXISTS "Users can only see their own contacts" ON contacts;
DROP POLICY IF EXISTS "Users can insert their own contacts" ON contacts;
DROP POLICY IF EXISTS "Users can update their own contacts" ON contacts;
DROP POLICY IF EXISTS "Users can delete their own contacts" ON contacts;
DROP POLICY IF EXISTS "contacts_select" ON contacts;
DROP POLICY IF EXISTS "contacts_insert" ON contacts;
DROP POLICY IF EXISTS "contacts_update" ON contacts;
DROP POLICY IF EXISTS "contacts_delete" ON contacts;

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts FORCE ROW LEVEL SECURITY;

CREATE POLICY "contacts_select" ON contacts FOR SELECT
  USING (user_id = app.current_user_id()::uuid);
CREATE POLICY "contacts_insert" ON contacts FOR INSERT
  WITH CHECK (user_id = app.current_user_id()::uuid);
CREATE POLICY "contacts_update" ON contacts FOR UPDATE
  USING (user_id = app.current_user_id()::uuid)
  WITH CHECK (user_id = app.current_user_id()::uuid);
CREATE POLICY "contacts_delete" ON contacts FOR DELETE
  USING (user_id = app.current_user_id()::uuid);


-- --------------------------------------------
-- northstar
-- --------------------------------------------
DROP POLICY IF EXISTS "Enable all operations for authenticated users" ON northstar;
DROP POLICY IF EXISTS "Users can only see their own northstar" ON northstar;
DROP POLICY IF EXISTS "Users can insert their own northstar" ON northstar;
DROP POLICY IF EXISTS "Users can update their own northstar" ON northstar;
DROP POLICY IF EXISTS "Users can delete their own northstar" ON northstar;
DROP POLICY IF EXISTS "northstar_select" ON northstar;
DROP POLICY IF EXISTS "northstar_insert" ON northstar;
DROP POLICY IF EXISTS "northstar_update" ON northstar;
DROP POLICY IF EXISTS "northstar_delete" ON northstar;

ALTER TABLE northstar ENABLE ROW LEVEL SECURITY;
ALTER TABLE northstar FORCE ROW LEVEL SECURITY;

CREATE POLICY "northstar_select" ON northstar FOR SELECT
  USING (user_id = app.current_user_id()::uuid);
CREATE POLICY "northstar_insert" ON northstar FOR INSERT
  WITH CHECK (user_id = app.current_user_id()::uuid);
CREATE POLICY "northstar_update" ON northstar FOR UPDATE
  USING (user_id = app.current_user_id()::uuid)
  WITH CHECK (user_id = app.current_user_id()::uuid);
CREATE POLICY "northstar_delete" ON northstar FOR DELETE
  USING (user_id = app.current_user_id()::uuid);


-- --------------------------------------------
-- journal
-- --------------------------------------------
DROP POLICY IF EXISTS "Enable all operations for authenticated users" ON journal;
DROP POLICY IF EXISTS "Users can only see their own journal" ON journal;
DROP POLICY IF EXISTS "Users can insert their own journal" ON journal;
DROP POLICY IF EXISTS "Users can update their own journal" ON journal;
DROP POLICY IF EXISTS "Users can delete their own journal" ON journal;
DROP POLICY IF EXISTS "journal_select" ON journal;
DROP POLICY IF EXISTS "journal_insert" ON journal;
DROP POLICY IF EXISTS "journal_update" ON journal;
DROP POLICY IF EXISTS "journal_delete" ON journal;

ALTER TABLE journal ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal FORCE ROW LEVEL SECURITY;

CREATE POLICY "journal_select" ON journal FOR SELECT
  USING (user_id = app.current_user_id()::uuid);
CREATE POLICY "journal_insert" ON journal FOR INSERT
  WITH CHECK (user_id = app.current_user_id()::uuid);
CREATE POLICY "journal_update" ON journal FOR UPDATE
  USING (user_id = app.current_user_id()::uuid)
  WITH CHECK (user_id = app.current_user_id()::uuid);
CREATE POLICY "journal_delete" ON journal FOR DELETE
  USING (user_id = app.current_user_id()::uuid);


-- --------------------------------------------
-- notepad
-- --------------------------------------------
DROP POLICY IF EXISTS "Enable all operations for authenticated users" ON notepad;
DROP POLICY IF EXISTS "Users can only see their own notepad" ON notepad;
DROP POLICY IF EXISTS "Users can insert their own notepad" ON notepad;
DROP POLICY IF EXISTS "Users can update their own notepad" ON notepad;
DROP POLICY IF EXISTS "Users can delete their own notepad" ON notepad;
DROP POLICY IF EXISTS "notepad_select" ON notepad;
DROP POLICY IF EXISTS "notepad_insert" ON notepad;
DROP POLICY IF EXISTS "notepad_update" ON notepad;
DROP POLICY IF EXISTS "notepad_delete" ON notepad;

ALTER TABLE notepad ENABLE ROW LEVEL SECURITY;
ALTER TABLE notepad FORCE ROW LEVEL SECURITY;

CREATE POLICY "notepad_select" ON notepad FOR SELECT
  USING (user_id = app.current_user_id()::uuid);
CREATE POLICY "notepad_insert" ON notepad FOR INSERT
  WITH CHECK (user_id = app.current_user_id()::uuid);
CREATE POLICY "notepad_update" ON notepad FOR UPDATE
  USING (user_id = app.current_user_id()::uuid)
  WITH CHECK (user_id = app.current_user_id()::uuid);
CREATE POLICY "notepad_delete" ON notepad FOR DELETE
  USING (user_id = app.current_user_id()::uuid);


-- --------------------------------------------
-- notepad_revisions
-- --------------------------------------------
DROP POLICY IF EXISTS "Enable all operations for authenticated users" ON notepad_revisions;
DROP POLICY IF EXISTS "Users can only see their own notepad_revisions" ON notepad_revisions;
DROP POLICY IF EXISTS "Users can insert their own notepad_revisions" ON notepad_revisions;
DROP POLICY IF EXISTS "Users can update their own notepad_revisions" ON notepad_revisions;
DROP POLICY IF EXISTS "Users can delete their own notepad_revisions" ON notepad_revisions;
DROP POLICY IF EXISTS "notepad_revisions_select" ON notepad_revisions;
DROP POLICY IF EXISTS "notepad_revisions_insert" ON notepad_revisions;
DROP POLICY IF EXISTS "notepad_revisions_update" ON notepad_revisions;
DROP POLICY IF EXISTS "notepad_revisions_delete" ON notepad_revisions;

ALTER TABLE notepad_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notepad_revisions FORCE ROW LEVEL SECURITY;

CREATE POLICY "notepad_revisions_select" ON notepad_revisions FOR SELECT
  USING (user_id = app.current_user_id()::uuid);
CREATE POLICY "notepad_revisions_insert" ON notepad_revisions FOR INSERT
  WITH CHECK (user_id = app.current_user_id()::uuid);
CREATE POLICY "notepad_revisions_update" ON notepad_revisions FOR UPDATE
  USING (user_id = app.current_user_id()::uuid)
  WITH CHECK (user_id = app.current_user_id()::uuid);
CREATE POLICY "notepad_revisions_delete" ON notepad_revisions FOR DELETE
  USING (user_id = app.current_user_id()::uuid);


-- ============================================
-- SECTION 2: FITNESS TABLES
-- ============================================

-- --------------------------------------------
-- fitness_database
-- --------------------------------------------
DROP POLICY IF EXISTS "Enable all operations for authenticated users" ON fitness_database;
DROP POLICY IF EXISTS "Users can only see their own fitness_database" ON fitness_database;
DROP POLICY IF EXISTS "Users can insert their own fitness_database" ON fitness_database;
DROP POLICY IF EXISTS "Users can update their own fitness_database" ON fitness_database;
DROP POLICY IF EXISTS "Users can delete their own fitness_database" ON fitness_database;
DROP POLICY IF EXISTS "fitness_database_select" ON fitness_database;
DROP POLICY IF EXISTS "fitness_database_insert" ON fitness_database;
DROP POLICY IF EXISTS "fitness_database_update" ON fitness_database;
DROP POLICY IF EXISTS "fitness_database_delete" ON fitness_database;

ALTER TABLE fitness_database ENABLE ROW LEVEL SECURITY;
ALTER TABLE fitness_database FORCE ROW LEVEL SECURITY;

CREATE POLICY "fitness_database_select" ON fitness_database FOR SELECT
  USING (user_id = app.current_user_id()::uuid);
CREATE POLICY "fitness_database_insert" ON fitness_database FOR INSERT
  WITH CHECK (user_id = app.current_user_id()::uuid);
CREATE POLICY "fitness_database_update" ON fitness_database FOR UPDATE
  USING (user_id = app.current_user_id()::uuid)
  WITH CHECK (user_id = app.current_user_id()::uuid);
CREATE POLICY "fitness_database_delete" ON fitness_database FOR DELETE
  USING (user_id = app.current_user_id()::uuid);


-- --------------------------------------------
-- fitness_completion_history
-- --------------------------------------------
DROP POLICY IF EXISTS "Enable all operations for authenticated users" ON fitness_completion_history;
DROP POLICY IF EXISTS "Users can only see their own fitness_completion_history" ON fitness_completion_history;
DROP POLICY IF EXISTS "Users can insert their own fitness_completion_history" ON fitness_completion_history;
DROP POLICY IF EXISTS "Users can update their own fitness_completion_history" ON fitness_completion_history;
DROP POLICY IF EXISTS "Users can delete their own fitness_completion_history" ON fitness_completion_history;
DROP POLICY IF EXISTS "fitness_completion_history_select" ON fitness_completion_history;
DROP POLICY IF EXISTS "fitness_completion_history_insert" ON fitness_completion_history;
DROP POLICY IF EXISTS "fitness_completion_history_update" ON fitness_completion_history;
DROP POLICY IF EXISTS "fitness_completion_history_delete" ON fitness_completion_history;

ALTER TABLE fitness_completion_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE fitness_completion_history FORCE ROW LEVEL SECURITY;

CREATE POLICY "fitness_completion_history_select" ON fitness_completion_history FOR SELECT
  USING (user_id = app.current_user_id()::uuid);
CREATE POLICY "fitness_completion_history_insert" ON fitness_completion_history FOR INSERT
  WITH CHECK (user_id = app.current_user_id()::uuid);
CREATE POLICY "fitness_completion_history_update" ON fitness_completion_history FOR UPDATE
  USING (user_id = app.current_user_id()::uuid)
  WITH CHECK (user_id = app.current_user_id()::uuid);
CREATE POLICY "fitness_completion_history_delete" ON fitness_completion_history FOR DELETE
  USING (user_id = app.current_user_id()::uuid);


-- ============================================
-- SECTION 3: HYROX TABLES
-- ============================================

-- --------------------------------------------
-- hyrox_workouts
-- --------------------------------------------
DROP POLICY IF EXISTS "Enable all operations for authenticated users" ON hyrox_workouts;
DROP POLICY IF EXISTS "Users can only see their own hyrox_workouts" ON hyrox_workouts;
DROP POLICY IF EXISTS "Users can insert their own hyrox_workouts" ON hyrox_workouts;
DROP POLICY IF EXISTS "Users can update their own hyrox_workouts" ON hyrox_workouts;
DROP POLICY IF EXISTS "Users can delete their own hyrox_workouts" ON hyrox_workouts;
DROP POLICY IF EXISTS "hyrox_workouts_select" ON hyrox_workouts;
DROP POLICY IF EXISTS "hyrox_workouts_insert" ON hyrox_workouts;
DROP POLICY IF EXISTS "hyrox_workouts_update" ON hyrox_workouts;
DROP POLICY IF EXISTS "hyrox_workouts_delete" ON hyrox_workouts;

ALTER TABLE hyrox_workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE hyrox_workouts FORCE ROW LEVEL SECURITY;

CREATE POLICY "hyrox_workouts_select" ON hyrox_workouts FOR SELECT
  USING (user_id = app.current_user_id()::uuid);
CREATE POLICY "hyrox_workouts_insert" ON hyrox_workouts FOR INSERT
  WITH CHECK (user_id = app.current_user_id()::uuid);
CREATE POLICY "hyrox_workouts_update" ON hyrox_workouts FOR UPDATE
  USING (user_id = app.current_user_id()::uuid)
  WITH CHECK (user_id = app.current_user_id()::uuid);
CREATE POLICY "hyrox_workouts_delete" ON hyrox_workouts FOR DELETE
  USING (user_id = app.current_user_id()::uuid);


-- --------------------------------------------
-- hyrox_workout_stations
-- --------------------------------------------
DROP POLICY IF EXISTS "Enable all operations for authenticated users" ON hyrox_workout_stations;
DROP POLICY IF EXISTS "Users can only see their own hyrox_workout_stations" ON hyrox_workout_stations;
DROP POLICY IF EXISTS "Users can insert their own hyrox_workout_stations" ON hyrox_workout_stations;
DROP POLICY IF EXISTS "Users can update their own hyrox_workout_stations" ON hyrox_workout_stations;
DROP POLICY IF EXISTS "Users can delete their own hyrox_workout_stations" ON hyrox_workout_stations;
DROP POLICY IF EXISTS "hyrox_workout_stations_select" ON hyrox_workout_stations;
DROP POLICY IF EXISTS "hyrox_workout_stations_insert" ON hyrox_workout_stations;
DROP POLICY IF EXISTS "hyrox_workout_stations_update" ON hyrox_workout_stations;
DROP POLICY IF EXISTS "hyrox_workout_stations_delete" ON hyrox_workout_stations;

ALTER TABLE hyrox_workout_stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE hyrox_workout_stations FORCE ROW LEVEL SECURITY;

CREATE POLICY "hyrox_workout_stations_select" ON hyrox_workout_stations FOR SELECT
  USING (user_id = app.current_user_id()::uuid);
CREATE POLICY "hyrox_workout_stations_insert" ON hyrox_workout_stations FOR INSERT
  WITH CHECK (user_id = app.current_user_id()::uuid);
CREATE POLICY "hyrox_workout_stations_update" ON hyrox_workout_stations FOR UPDATE
  USING (user_id = app.current_user_id()::uuid)
  WITH CHECK (user_id = app.current_user_id()::uuid);
CREATE POLICY "hyrox_workout_stations_delete" ON hyrox_workout_stations FOR DELETE
  USING (user_id = app.current_user_id()::uuid);


-- --------------------------------------------
-- hyrox_station_records
-- --------------------------------------------
DROP POLICY IF EXISTS "Enable all operations for authenticated users" ON hyrox_station_records;
DROP POLICY IF EXISTS "Users can only see their own hyrox_station_records" ON hyrox_station_records;
DROP POLICY IF EXISTS "Users can insert their own hyrox_station_records" ON hyrox_station_records;
DROP POLICY IF EXISTS "Users can update their own hyrox_station_records" ON hyrox_station_records;
DROP POLICY IF EXISTS "Users can delete their own hyrox_station_records" ON hyrox_station_records;
DROP POLICY IF EXISTS "hyrox_station_records_select" ON hyrox_station_records;
DROP POLICY IF EXISTS "hyrox_station_records_insert" ON hyrox_station_records;
DROP POLICY IF EXISTS "hyrox_station_records_update" ON hyrox_station_records;
DROP POLICY IF EXISTS "hyrox_station_records_delete" ON hyrox_station_records;

ALTER TABLE hyrox_station_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE hyrox_station_records FORCE ROW LEVEL SECURITY;

CREATE POLICY "hyrox_station_records_select" ON hyrox_station_records FOR SELECT
  USING (user_id = app.current_user_id()::uuid);
CREATE POLICY "hyrox_station_records_insert" ON hyrox_station_records FOR INSERT
  WITH CHECK (user_id = app.current_user_id()::uuid);
CREATE POLICY "hyrox_station_records_update" ON hyrox_station_records FOR UPDATE
  USING (user_id = app.current_user_id()::uuid)
  WITH CHECK (user_id = app.current_user_id()::uuid);
CREATE POLICY "hyrox_station_records_delete" ON hyrox_station_records FOR DELETE
  USING (user_id = app.current_user_id()::uuid);


-- ============================================
-- SECTION 4: MODULE TABLES
-- ============================================

-- --------------------------------------------
-- motivation_content
-- --------------------------------------------
DROP POLICY IF EXISTS "Enable all operations for authenticated users" ON motivation_content;
DROP POLICY IF EXISTS "Users can only see their own motivation_content" ON motivation_content;
DROP POLICY IF EXISTS "Users can insert their own motivation_content" ON motivation_content;
DROP POLICY IF EXISTS "Users can update their own motivation_content" ON motivation_content;
DROP POLICY IF EXISTS "Users can delete their own motivation_content" ON motivation_content;
DROP POLICY IF EXISTS "motivation_content_select" ON motivation_content;
DROP POLICY IF EXISTS "motivation_content_insert" ON motivation_content;
DROP POLICY IF EXISTS "motivation_content_update" ON motivation_content;
DROP POLICY IF EXISTS "motivation_content_delete" ON motivation_content;

ALTER TABLE motivation_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE motivation_content FORCE ROW LEVEL SECURITY;

CREATE POLICY "motivation_content_select" ON motivation_content FOR SELECT
  USING (user_id = app.current_user_id()::uuid);
CREATE POLICY "motivation_content_insert" ON motivation_content FOR INSERT
  WITH CHECK (user_id = app.current_user_id()::uuid);
CREATE POLICY "motivation_content_update" ON motivation_content FOR UPDATE
  USING (user_id = app.current_user_id()::uuid)
  WITH CHECK (user_id = app.current_user_id()::uuid);
CREATE POLICY "motivation_content_delete" ON motivation_content FOR DELETE
  USING (user_id = app.current_user_id()::uuid);


-- --------------------------------------------
-- shipments
-- --------------------------------------------
DROP POLICY IF EXISTS "Enable all operations for authenticated users" ON shipments;
DROP POLICY IF EXISTS "Users can only see their own shipments" ON shipments;
DROP POLICY IF EXISTS "Users can insert their own shipments" ON shipments;
DROP POLICY IF EXISTS "Users can update their own shipments" ON shipments;
DROP POLICY IF EXISTS "Users can delete their own shipments" ON shipments;
DROP POLICY IF EXISTS "shipments_select" ON shipments;
DROP POLICY IF EXISTS "shipments_insert" ON shipments;
DROP POLICY IF EXISTS "shipments_update" ON shipments;
DROP POLICY IF EXISTS "shipments_delete" ON shipments;

ALTER TABLE shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipments FORCE ROW LEVEL SECURITY;

CREATE POLICY "shipments_select" ON shipments FOR SELECT
  USING (user_id = app.current_user_id()::uuid);
CREATE POLICY "shipments_insert" ON shipments FOR INSERT
  WITH CHECK (user_id = app.current_user_id()::uuid);
CREATE POLICY "shipments_update" ON shipments FOR UPDATE
  USING (user_id = app.current_user_id()::uuid)
  WITH CHECK (user_id = app.current_user_id()::uuid);
CREATE POLICY "shipments_delete" ON shipments FOR DELETE
  USING (user_id = app.current_user_id()::uuid);


-- --------------------------------------------
-- winter_arc_goals
-- --------------------------------------------
DROP POLICY IF EXISTS "Enable all operations for authenticated users" ON winter_arc_goals;
DROP POLICY IF EXISTS "Users can only see their own winter_arc_goals" ON winter_arc_goals;
DROP POLICY IF EXISTS "Users can insert their own winter_arc_goals" ON winter_arc_goals;
DROP POLICY IF EXISTS "Users can update their own winter_arc_goals" ON winter_arc_goals;
DROP POLICY IF EXISTS "Users can delete their own winter_arc_goals" ON winter_arc_goals;
DROP POLICY IF EXISTS "winter_arc_goals_select" ON winter_arc_goals;
DROP POLICY IF EXISTS "winter_arc_goals_insert" ON winter_arc_goals;
DROP POLICY IF EXISTS "winter_arc_goals_update" ON winter_arc_goals;
DROP POLICY IF EXISTS "winter_arc_goals_delete" ON winter_arc_goals;

ALTER TABLE winter_arc_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE winter_arc_goals FORCE ROW LEVEL SECURITY;

CREATE POLICY "winter_arc_goals_select" ON winter_arc_goals FOR SELECT
  USING (user_id = app.current_user_id()::uuid);
CREATE POLICY "winter_arc_goals_insert" ON winter_arc_goals FOR INSERT
  WITH CHECK (user_id = app.current_user_id()::uuid);
CREATE POLICY "winter_arc_goals_update" ON winter_arc_goals FOR UPDATE
  USING (user_id = app.current_user_id()::uuid)
  WITH CHECK (user_id = app.current_user_id()::uuid);
CREATE POLICY "winter_arc_goals_delete" ON winter_arc_goals FOR DELETE
  USING (user_id = app.current_user_id()::uuid);


-- --------------------------------------------
-- contribution_graph
-- --------------------------------------------
DROP POLICY IF EXISTS "Enable all operations for authenticated users" ON contribution_graph;
DROP POLICY IF EXISTS "Users can only see their own contribution_graph" ON contribution_graph;
DROP POLICY IF EXISTS "Users can insert their own contribution_graph" ON contribution_graph;
DROP POLICY IF EXISTS "Users can update their own contribution_graph" ON contribution_graph;
DROP POLICY IF EXISTS "Users can delete their own contribution_graph" ON contribution_graph;
DROP POLICY IF EXISTS "contribution_graph_select" ON contribution_graph;
DROP POLICY IF EXISTS "contribution_graph_insert" ON contribution_graph;
DROP POLICY IF EXISTS "contribution_graph_update" ON contribution_graph;
DROP POLICY IF EXISTS "contribution_graph_delete" ON contribution_graph;

ALTER TABLE contribution_graph ENABLE ROW LEVEL SECURITY;
ALTER TABLE contribution_graph FORCE ROW LEVEL SECURITY;

CREATE POLICY "contribution_graph_select" ON contribution_graph FOR SELECT
  USING (user_id = app.current_user_id()::uuid);
CREATE POLICY "contribution_graph_insert" ON contribution_graph FOR INSERT
  WITH CHECK (user_id = app.current_user_id()::uuid);
CREATE POLICY "contribution_graph_update" ON contribution_graph FOR UPDATE
  USING (user_id = app.current_user_id()::uuid)
  WITH CHECK (user_id = app.current_user_id()::uuid);
CREATE POLICY "contribution_graph_delete" ON contribution_graph FOR DELETE
  USING (user_id = app.current_user_id()::uuid);


-- --------------------------------------------
-- user_feature_preferences
-- --------------------------------------------
DROP POLICY IF EXISTS "Enable all operations for authenticated users" ON user_feature_preferences;
DROP POLICY IF EXISTS "Users can only see their own user_feature_preferences" ON user_feature_preferences;
DROP POLICY IF EXISTS "Users can insert their own user_feature_preferences" ON user_feature_preferences;
DROP POLICY IF EXISTS "Users can update their own user_feature_preferences" ON user_feature_preferences;
DROP POLICY IF EXISTS "Users can delete their own user_feature_preferences" ON user_feature_preferences;
DROP POLICY IF EXISTS "user_feature_preferences_select" ON user_feature_preferences;
DROP POLICY IF EXISTS "user_feature_preferences_insert" ON user_feature_preferences;
DROP POLICY IF EXISTS "user_feature_preferences_update" ON user_feature_preferences;
DROP POLICY IF EXISTS "user_feature_preferences_delete" ON user_feature_preferences;

ALTER TABLE user_feature_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_feature_preferences FORCE ROW LEVEL SECURITY;

CREATE POLICY "user_feature_preferences_select" ON user_feature_preferences FOR SELECT
  USING (user_id = app.current_user_id()::uuid);
CREATE POLICY "user_feature_preferences_insert" ON user_feature_preferences FOR INSERT
  WITH CHECK (user_id = app.current_user_id()::uuid);
CREATE POLICY "user_feature_preferences_update" ON user_feature_preferences FOR UPDATE
  USING (user_id = app.current_user_id()::uuid)
  WITH CHECK (user_id = app.current_user_id()::uuid);
CREATE POLICY "user_feature_preferences_delete" ON user_feature_preferences FOR DELETE
  USING (user_id = app.current_user_id()::uuid);


-- --------------------------------------------
-- hello_world_entries
-- --------------------------------------------
DROP POLICY IF EXISTS "Enable all operations for authenticated users" ON hello_world_entries;
DROP POLICY IF EXISTS "Users can only see their own hello_world_entries" ON hello_world_entries;
DROP POLICY IF EXISTS "Users can insert their own hello_world_entries" ON hello_world_entries;
DROP POLICY IF EXISTS "Users can update their own hello_world_entries" ON hello_world_entries;
DROP POLICY IF EXISTS "Users can delete their own hello_world_entries" ON hello_world_entries;
DROP POLICY IF EXISTS "hello_world_entries_select" ON hello_world_entries;
DROP POLICY IF EXISTS "hello_world_entries_insert" ON hello_world_entries;
DROP POLICY IF EXISTS "hello_world_entries_update" ON hello_world_entries;
DROP POLICY IF EXISTS "hello_world_entries_delete" ON hello_world_entries;

ALTER TABLE hello_world_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE hello_world_entries FORCE ROW LEVEL SECURITY;

CREATE POLICY "hello_world_entries_select" ON hello_world_entries FOR SELECT
  USING (user_id = app.current_user_id()::uuid);
CREATE POLICY "hello_world_entries_insert" ON hello_world_entries FOR INSERT
  WITH CHECK (user_id = app.current_user_id()::uuid);
CREATE POLICY "hello_world_entries_update" ON hello_world_entries FOR UPDATE
  USING (user_id = app.current_user_id()::uuid)
  WITH CHECK (user_id = app.current_user_id()::uuid);
CREATE POLICY "hello_world_entries_delete" ON hello_world_entries FOR DELETE
  USING (user_id = app.current_user_id()::uuid);


-- --------------------------------------------
-- module_settings
-- --------------------------------------------
DROP POLICY IF EXISTS "Enable all operations for authenticated users" ON module_settings;
DROP POLICY IF EXISTS "Users can only see their own module_settings" ON module_settings;
DROP POLICY IF EXISTS "Users can insert their own module_settings" ON module_settings;
DROP POLICY IF EXISTS "Users can update their own module_settings" ON module_settings;
DROP POLICY IF EXISTS "Users can delete their own module_settings" ON module_settings;
DROP POLICY IF EXISTS "module_settings_select" ON module_settings;
DROP POLICY IF EXISTS "module_settings_insert" ON module_settings;
DROP POLICY IF EXISTS "module_settings_update" ON module_settings;
DROP POLICY IF EXISTS "module_settings_delete" ON module_settings;

ALTER TABLE module_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE module_settings FORCE ROW LEVEL SECURITY;

CREATE POLICY "module_settings_select" ON module_settings FOR SELECT
  USING (user_id = app.current_user_id()::uuid);
CREATE POLICY "module_settings_insert" ON module_settings FOR INSERT
  WITH CHECK (user_id = app.current_user_id()::uuid);
CREATE POLICY "module_settings_update" ON module_settings FOR UPDATE
  USING (user_id = app.current_user_id()::uuid)
  WITH CHECK (user_id = app.current_user_id()::uuid);
CREATE POLICY "module_settings_delete" ON module_settings FOR DELETE
  USING (user_id = app.current_user_id()::uuid);


-- --------------------------------------------
-- major_projects
-- --------------------------------------------
DROP POLICY IF EXISTS "Enable all operations for authenticated users" ON major_projects;
DROP POLICY IF EXISTS "Users can only see their own major_projects" ON major_projects;
DROP POLICY IF EXISTS "Users can insert their own major_projects" ON major_projects;
DROP POLICY IF EXISTS "Users can update their own major_projects" ON major_projects;
DROP POLICY IF EXISTS "Users can delete their own major_projects" ON major_projects;
DROP POLICY IF EXISTS "major_projects_select" ON major_projects;
DROP POLICY IF EXISTS "major_projects_insert" ON major_projects;
DROP POLICY IF EXISTS "major_projects_update" ON major_projects;
DROP POLICY IF EXISTS "major_projects_delete" ON major_projects;

ALTER TABLE major_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE major_projects FORCE ROW LEVEL SECURITY;

CREATE POLICY "major_projects_select" ON major_projects FOR SELECT
  USING (user_id = app.current_user_id()::uuid);
CREATE POLICY "major_projects_insert" ON major_projects FOR INSERT
  WITH CHECK (user_id = app.current_user_id()::uuid);
CREATE POLICY "major_projects_update" ON major_projects FOR UPDATE
  USING (user_id = app.current_user_id()::uuid)
  WITH CHECK (user_id = app.current_user_id()::uuid);
CREATE POLICY "major_projects_delete" ON major_projects FOR DELETE
  USING (user_id = app.current_user_id()::uuid);


-- --------------------------------------------
-- quotes
-- --------------------------------------------
DROP POLICY IF EXISTS "Enable all operations for authenticated users" ON quotes;
DROP POLICY IF EXISTS "Users can only see their own quotes" ON quotes;
DROP POLICY IF EXISTS "Users can insert their own quotes" ON quotes;
DROP POLICY IF EXISTS "Users can update their own quotes" ON quotes;
DROP POLICY IF EXISTS "Users can delete their own quotes" ON quotes;
DROP POLICY IF EXISTS "quotes_select" ON quotes;
DROP POLICY IF EXISTS "quotes_insert" ON quotes;
DROP POLICY IF EXISTS "quotes_update" ON quotes;
DROP POLICY IF EXISTS "quotes_delete" ON quotes;

ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes FORCE ROW LEVEL SECURITY;

CREATE POLICY "quotes_select" ON quotes FOR SELECT
  USING (user_id = app.current_user_id()::uuid);
CREATE POLICY "quotes_insert" ON quotes FOR INSERT
  WITH CHECK (user_id = app.current_user_id()::uuid);
CREATE POLICY "quotes_update" ON quotes FOR UPDATE
  USING (user_id = app.current_user_id()::uuid)
  WITH CHECK (user_id = app.current_user_id()::uuid);
CREATE POLICY "quotes_delete" ON quotes FOR DELETE
  USING (user_id = app.current_user_id()::uuid);


-- --------------------------------------------
-- travel
-- --------------------------------------------
DROP POLICY IF EXISTS "Enable all operations for authenticated users" ON travel;
DROP POLICY IF EXISTS "Users can only see their own travel" ON travel;
DROP POLICY IF EXISTS "Users can insert their own travel" ON travel;
DROP POLICY IF EXISTS "Users can update their own travel" ON travel;
DROP POLICY IF EXISTS "Users can delete their own travel" ON travel;
DROP POLICY IF EXISTS "travel_select" ON travel;
DROP POLICY IF EXISTS "travel_insert" ON travel;
DROP POLICY IF EXISTS "travel_update" ON travel;
DROP POLICY IF EXISTS "travel_delete" ON travel;

ALTER TABLE travel ENABLE ROW LEVEL SECURITY;
ALTER TABLE travel FORCE ROW LEVEL SECURITY;

CREATE POLICY "travel_select" ON travel FOR SELECT
  USING (user_id = app.current_user_id()::uuid);
CREATE POLICY "travel_insert" ON travel FOR INSERT
  WITH CHECK (user_id = app.current_user_id()::uuid);
CREATE POLICY "travel_update" ON travel FOR UPDATE
  USING (user_id = app.current_user_id()::uuid)
  WITH CHECK (user_id = app.current_user_id()::uuid);
CREATE POLICY "travel_delete" ON travel FOR DELETE
  USING (user_id = app.current_user_id()::uuid);


-- --------------------------------------------
-- travel_activities
-- --------------------------------------------
DROP POLICY IF EXISTS "Enable all operations for authenticated users" ON travel_activities;
DROP POLICY IF EXISTS "Users can only see their own travel_activities" ON travel_activities;
DROP POLICY IF EXISTS "Users can insert their own travel_activities" ON travel_activities;
DROP POLICY IF EXISTS "Users can update their own travel_activities" ON travel_activities;
DROP POLICY IF EXISTS "Users can delete their own travel_activities" ON travel_activities;
DROP POLICY IF EXISTS "travel_activities_select" ON travel_activities;
DROP POLICY IF EXISTS "travel_activities_insert" ON travel_activities;
DROP POLICY IF EXISTS "travel_activities_update" ON travel_activities;
DROP POLICY IF EXISTS "travel_activities_delete" ON travel_activities;

ALTER TABLE travel_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE travel_activities FORCE ROW LEVEL SECURITY;

CREATE POLICY "travel_activities_select" ON travel_activities FOR SELECT
  USING (user_id = app.current_user_id()::uuid);
CREATE POLICY "travel_activities_insert" ON travel_activities FOR INSERT
  WITH CHECK (user_id = app.current_user_id()::uuid);
CREATE POLICY "travel_activities_update" ON travel_activities FOR UPDATE
  USING (user_id = app.current_user_id()::uuid)
  WITH CHECK (user_id = app.current_user_id()::uuid);
CREATE POLICY "travel_activities_delete" ON travel_activities FOR DELETE
  USING (user_id = app.current_user_id()::uuid);


-- --------------------------------------------
-- ohtani_grid_cells
-- --------------------------------------------
DROP POLICY IF EXISTS "Enable all operations for authenticated users" ON ohtani_grid_cells;
DROP POLICY IF EXISTS "Users can only see their own ohtani_grid_cells" ON ohtani_grid_cells;
DROP POLICY IF EXISTS "Users can insert their own ohtani_grid_cells" ON ohtani_grid_cells;
DROP POLICY IF EXISTS "Users can update their own ohtani_grid_cells" ON ohtani_grid_cells;
DROP POLICY IF EXISTS "Users can delete their own ohtani_grid_cells" ON ohtani_grid_cells;
DROP POLICY IF EXISTS "ohtani_grid_cells_select" ON ohtani_grid_cells;
DROP POLICY IF EXISTS "ohtani_grid_cells_insert" ON ohtani_grid_cells;
DROP POLICY IF EXISTS "ohtani_grid_cells_update" ON ohtani_grid_cells;
DROP POLICY IF EXISTS "ohtani_grid_cells_delete" ON ohtani_grid_cells;

ALTER TABLE ohtani_grid_cells ENABLE ROW LEVEL SECURITY;
ALTER TABLE ohtani_grid_cells FORCE ROW LEVEL SECURITY;

CREATE POLICY "ohtani_grid_cells_select" ON ohtani_grid_cells FOR SELECT
  USING (user_id = app.current_user_id()::uuid);
CREATE POLICY "ohtani_grid_cells_insert" ON ohtani_grid_cells FOR INSERT
  WITH CHECK (user_id = app.current_user_id()::uuid);
CREATE POLICY "ohtani_grid_cells_update" ON ohtani_grid_cells FOR UPDATE
  USING (user_id = app.current_user_id()::uuid)
  WITH CHECK (user_id = app.current_user_id()::uuid);
CREATE POLICY "ohtani_grid_cells_delete" ON ohtani_grid_cells FOR DELETE
  USING (user_id = app.current_user_id()::uuid);


-- --------------------------------------------
-- gratitude_entries
-- --------------------------------------------
DROP POLICY IF EXISTS "Enable all operations for authenticated users" ON gratitude_entries;
DROP POLICY IF EXISTS "Users can only see their own gratitude_entries" ON gratitude_entries;
DROP POLICY IF EXISTS "Users can insert their own gratitude_entries" ON gratitude_entries;
DROP POLICY IF EXISTS "Users can update their own gratitude_entries" ON gratitude_entries;
DROP POLICY IF EXISTS "Users can delete their own gratitude_entries" ON gratitude_entries;
DROP POLICY IF EXISTS "gratitude_entries_select" ON gratitude_entries;
DROP POLICY IF EXISTS "gratitude_entries_insert" ON gratitude_entries;
DROP POLICY IF EXISTS "gratitude_entries_update" ON gratitude_entries;
DROP POLICY IF EXISTS "gratitude_entries_delete" ON gratitude_entries;

ALTER TABLE gratitude_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE gratitude_entries FORCE ROW LEVEL SECURITY;

CREATE POLICY "gratitude_entries_select" ON gratitude_entries FOR SELECT
  USING (user_id = app.current_user_id()::uuid);
CREATE POLICY "gratitude_entries_insert" ON gratitude_entries FOR INSERT
  WITH CHECK (user_id = app.current_user_id()::uuid);
CREATE POLICY "gratitude_entries_update" ON gratitude_entries FOR UPDATE
  USING (user_id = app.current_user_id()::uuid)
  WITH CHECK (user_id = app.current_user_id()::uuid);
CREATE POLICY "gratitude_entries_delete" ON gratitude_entries FOR DELETE
  USING (user_id = app.current_user_id()::uuid);


-- ============================================
-- SECTION 5: KNOWLEDGE MANAGER TABLES
-- ============================================
-- These have special handling for collection_id foreign key validation

-- --------------------------------------------
-- knowledge_collections (must be created first - referenced by articles)
-- --------------------------------------------
DROP POLICY IF EXISTS "Users can view their own knowledge_collections" ON knowledge_collections;
DROP POLICY IF EXISTS "Users can insert their own knowledge_collections" ON knowledge_collections;
DROP POLICY IF EXISTS "Users can update their own knowledge_collections" ON knowledge_collections;
DROP POLICY IF EXISTS "Users can delete their own knowledge_collections" ON knowledge_collections;
DROP POLICY IF EXISTS "knowledge_collections_select" ON knowledge_collections;
DROP POLICY IF EXISTS "knowledge_collections_insert" ON knowledge_collections;
DROP POLICY IF EXISTS "knowledge_collections_update" ON knowledge_collections;
DROP POLICY IF EXISTS "knowledge_collections_delete" ON knowledge_collections;

ALTER TABLE knowledge_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_collections FORCE ROW LEVEL SECURITY;

CREATE POLICY "knowledge_collections_select" ON knowledge_collections FOR SELECT
  USING (user_id = app.current_user_id()::uuid);
CREATE POLICY "knowledge_collections_insert" ON knowledge_collections FOR INSERT
  WITH CHECK (user_id = app.current_user_id()::uuid);
CREATE POLICY "knowledge_collections_update" ON knowledge_collections FOR UPDATE
  USING (user_id = app.current_user_id()::uuid)
  WITH CHECK (user_id = app.current_user_id()::uuid);
CREATE POLICY "knowledge_collections_delete" ON knowledge_collections FOR DELETE
  USING (user_id = app.current_user_id()::uuid);


-- --------------------------------------------
-- knowledge_articles
-- --------------------------------------------
-- SPECIAL: INSERT and UPDATE policies also validate that collection_id
-- belongs to the current user (prevents assigning articles to other users' collections)

DROP POLICY IF EXISTS "Users can view their own knowledge_articles" ON knowledge_articles;
DROP POLICY IF EXISTS "Users can insert their own knowledge_articles" ON knowledge_articles;
DROP POLICY IF EXISTS "Users can update their own knowledge_articles" ON knowledge_articles;
DROP POLICY IF EXISTS "Users can delete their own knowledge_articles" ON knowledge_articles;
DROP POLICY IF EXISTS "knowledge_articles_select" ON knowledge_articles;
DROP POLICY IF EXISTS "knowledge_articles_insert" ON knowledge_articles;
DROP POLICY IF EXISTS "knowledge_articles_update" ON knowledge_articles;
DROP POLICY IF EXISTS "knowledge_articles_delete" ON knowledge_articles;

ALTER TABLE knowledge_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_articles FORCE ROW LEVEL SECURITY;

CREATE POLICY "knowledge_articles_select" ON knowledge_articles FOR SELECT
  USING (user_id = app.current_user_id()::uuid);

-- INSERT: Validates user owns the article AND the collection (if specified)
CREATE POLICY "knowledge_articles_insert" ON knowledge_articles FOR INSERT
  WITH CHECK (
    user_id = app.current_user_id()::uuid
    AND (
      collection_id IS NULL
      OR EXISTS (
        SELECT 1 FROM knowledge_collections
        WHERE id = collection_id
        AND user_id = app.current_user_id()::uuid
      )
    )
  );

-- UPDATE: Validates user owns the article AND the collection (if changing it)
CREATE POLICY "knowledge_articles_update" ON knowledge_articles FOR UPDATE
  USING (user_id = app.current_user_id()::uuid)
  WITH CHECK (
    user_id = app.current_user_id()::uuid
    AND (
      collection_id IS NULL
      OR EXISTS (
        SELECT 1 FROM knowledge_collections
        WHERE id = collection_id
        AND user_id = app.current_user_id()::uuid
      )
    )
  );

CREATE POLICY "knowledge_articles_delete" ON knowledge_articles FOR DELETE
  USING (user_id = app.current_user_id()::uuid);


-- ============================================
-- POST-MIGRATION VERIFICATION
-- ============================================
-- Run these queries to verify the migration succeeded

-- 1. Check all tables have RLS enabled:
/*
SELECT
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'tasks', 'contacts', 'northstar', 'journal', 'notepad', 'notepad_revisions',
    'fitness_database', 'fitness_completion_history',
    'hyrox_workouts', 'hyrox_workout_stations', 'hyrox_station_records',
    'motivation_content', 'shipments', 'winter_arc_goals', 'contribution_graph',
    'user_feature_preferences', 'hello_world_entries', 'module_settings',
    'major_projects', 'quotes', 'travel', 'travel_activities',
    'ohtani_grid_cells', 'gratitude_entries',
    'knowledge_articles', 'knowledge_collections'
  )
ORDER BY tablename;
-- Expected: All rows show rowsecurity = true
*/

-- 2. Count policies per table (should be 4 each):
/*
SELECT tablename, COUNT(*) as policy_count
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY tablename;
-- Expected: Each table has 4 policies
*/

-- 3. Verify policies use app.current_user_id():
/*
SELECT tablename, policyname, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND qual NOT LIKE '%app.current_user_id()%'
  AND qual IS NOT NULL;
-- Expected: 0 rows (all policies should use app.current_user_id())
*/


-- ============================================
-- END OF MIGRATION 002
-- ============================================
