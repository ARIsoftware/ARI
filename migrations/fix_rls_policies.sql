-- ================================================================
-- FIX RLS POLICIES: Replace broken auth.uid() and USING(true) policies
-- with (select current_setting('app.current_user_id')) policies
-- ================================================================
--
-- These policies align with ARI's withRLS() helper in /lib/db/index.ts,
-- which sets app.current_user_id via SET LOCAL in each transaction.
--
-- NOTE: Supabase's default "postgres" role has BYPASSRLS, so these
-- policies won't enforce at the DB level with that role. User isolation
-- is enforced at the application level by withRLS(). These policies
-- serve as defense-in-depth and will activate if you use a restricted role.
--
-- OPTIONAL HARDENING: Create a restricted role without BYPASSRLS:
--
--   CREATE ROLE ari_app LOGIN PASSWORD 'your-password' NOINHERIT;
--   GRANT USAGE ON SCHEMA public TO ari_app;
--   GRANT ALL ON ALL TABLES IN SCHEMA public TO ari_app;
--   GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO ari_app;
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ari_app;
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ari_app;
--   Then update DATABASE_URL to use ari_app instead of postgres.
--
-- ================================================================

BEGIN;

-- ================================================================
-- HELPER: Ensure app.current_user_id GUC is available
-- ================================================================

-- This allows SET LOCAL app.current_user_id = '...' without error
-- even if no custom GUC namespace is registered.
DO $$
BEGIN
  -- Test if the setting works (it will raise if GUC not allowed)
  PERFORM set_config('app.current_user_id', '', true);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'app.current_user_id GUC is available';
END $$;

-- ================================================================
-- USER DATA TABLES
-- All policies use: user_id::text = (select current_setting('app.current_user_id'))
-- Casting user_id to text works for both UUID and TEXT columns.
-- ================================================================

-- ----------------------------------------------------------------
-- notepad_revisions
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "Users can delete own notepad revisions" ON "notepad_revisions";
DROP POLICY IF EXISTS "Users can insert own notepad revisions" ON "notepad_revisions";
DROP POLICY IF EXISTS "Users can view own notepad revisions" ON "notepad_revisions";
DROP POLICY IF EXISTS "notepad_revisions_delete" ON "notepad_revisions";
DROP POLICY IF EXISTS "notepad_revisions_insert" ON "notepad_revisions";
DROP POLICY IF EXISTS "notepad_revisions_select" ON "notepad_revisions";
DROP POLICY IF EXISTS "notepad_revisions_update" ON "notepad_revisions";
DROP POLICY IF EXISTS "notepad_revisions_rls_select" ON "notepad_revisions";
DROP POLICY IF EXISTS "notepad_revisions_rls_insert" ON "notepad_revisions";
DROP POLICY IF EXISTS "notepad_revisions_rls_update" ON "notepad_revisions";
DROP POLICY IF EXISTS "notepad_revisions_rls_delete" ON "notepad_revisions";

ALTER TABLE "notepad_revisions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notepad_revisions_rls_select" ON "notepad_revisions" FOR SELECT USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "notepad_revisions_rls_insert" ON "notepad_revisions" FOR INSERT WITH CHECK (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "notepad_revisions_rls_update" ON "notepad_revisions" FOR UPDATE USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "notepad_revisions_rls_delete" ON "notepad_revisions" FOR DELETE USING (user_id::text = (select current_setting('app.current_user_id')));

-- ----------------------------------------------------------------
-- fitness_database
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "Users can delete their own fitness tasks" ON "fitness_database";
DROP POLICY IF EXISTS "Users can insert their own fitness tasks" ON "fitness_database";
DROP POLICY IF EXISTS "Users can update their own fitness tasks" ON "fitness_database";
DROP POLICY IF EXISTS "Users can view their own fitness tasks" ON "fitness_database";
DROP POLICY IF EXISTS "fitness_database_delete" ON "fitness_database";
DROP POLICY IF EXISTS "fitness_database_insert" ON "fitness_database";
DROP POLICY IF EXISTS "fitness_database_select" ON "fitness_database";
DROP POLICY IF EXISTS "fitness_database_update" ON "fitness_database";
DROP POLICY IF EXISTS "fitness_database_rls_select" ON "fitness_database";
DROP POLICY IF EXISTS "fitness_database_rls_insert" ON "fitness_database";
DROP POLICY IF EXISTS "fitness_database_rls_update" ON "fitness_database";
DROP POLICY IF EXISTS "fitness_database_rls_delete" ON "fitness_database";

ALTER TABLE "fitness_database" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fitness_database_rls_select" ON "fitness_database" FOR SELECT USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "fitness_database_rls_insert" ON "fitness_database" FOR INSERT WITH CHECK (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "fitness_database_rls_update" ON "fitness_database" FOR UPDATE USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "fitness_database_rls_delete" ON "fitness_database" FOR DELETE USING (user_id::text = (select current_setting('app.current_user_id')));

-- ----------------------------------------------------------------
-- gratitude_entries
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "Users can delete their own gratitude entries" ON "gratitude_entries";
DROP POLICY IF EXISTS "Users can insert their own gratitude entries" ON "gratitude_entries";
DROP POLICY IF EXISTS "Users can update their own gratitude entries" ON "gratitude_entries";
DROP POLICY IF EXISTS "Users can view their own gratitude entries" ON "gratitude_entries";
DROP POLICY IF EXISTS "gratitude_entries_delete" ON "gratitude_entries";
DROP POLICY IF EXISTS "gratitude_entries_insert" ON "gratitude_entries";
DROP POLICY IF EXISTS "gratitude_entries_select" ON "gratitude_entries";
DROP POLICY IF EXISTS "gratitude_entries_update" ON "gratitude_entries";
DROP POLICY IF EXISTS "gratitude_entries_rls_select" ON "gratitude_entries";
DROP POLICY IF EXISTS "gratitude_entries_rls_insert" ON "gratitude_entries";
DROP POLICY IF EXISTS "gratitude_entries_rls_update" ON "gratitude_entries";
DROP POLICY IF EXISTS "gratitude_entries_rls_delete" ON "gratitude_entries";

ALTER TABLE "gratitude_entries" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gratitude_entries_rls_select" ON "gratitude_entries" FOR SELECT USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "gratitude_entries_rls_insert" ON "gratitude_entries" FOR INSERT WITH CHECK (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "gratitude_entries_rls_update" ON "gratitude_entries" FOR UPDATE USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "gratitude_entries_rls_delete" ON "gratitude_entries" FOR DELETE USING (user_id::text = (select current_setting('app.current_user_id')));

-- ----------------------------------------------------------------
-- northstar
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "Users can delete their own goals" ON "northstar";
DROP POLICY IF EXISTS "Users can insert their own goals" ON "northstar";
DROP POLICY IF EXISTS "Users can update their own goals" ON "northstar";
DROP POLICY IF EXISTS "Users can view their own goals" ON "northstar";
DROP POLICY IF EXISTS "northstar_delete" ON "northstar";
DROP POLICY IF EXISTS "northstar_insert" ON "northstar";
DROP POLICY IF EXISTS "northstar_select" ON "northstar";
DROP POLICY IF EXISTS "northstar_update" ON "northstar";
DROP POLICY IF EXISTS "northstar_rls_select" ON "northstar";
DROP POLICY IF EXISTS "northstar_rls_insert" ON "northstar";
DROP POLICY IF EXISTS "northstar_rls_update" ON "northstar";
DROP POLICY IF EXISTS "northstar_rls_delete" ON "northstar";

ALTER TABLE "northstar" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "northstar_rls_select" ON "northstar" FOR SELECT USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "northstar_rls_insert" ON "northstar" FOR INSERT WITH CHECK (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "northstar_rls_update" ON "northstar" FOR UPDATE USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "northstar_rls_delete" ON "northstar" FOR DELETE USING (user_id::text = (select current_setting('app.current_user_id')));

-- ----------------------------------------------------------------
-- tasks
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "Users can delete their own completion history" ON "tasks";
DROP POLICY IF EXISTS "Users can delete their own fitness history" ON "tasks";
DROP POLICY IF EXISTS "Users can insert their own completion history" ON "tasks";
DROP POLICY IF EXISTS "Users can insert their own fitness history" ON "tasks";
DROP POLICY IF EXISTS "Users can update their own completion history" ON "tasks";
DROP POLICY IF EXISTS "Users can update their own fitness history" ON "tasks";
DROP POLICY IF EXISTS "Users can view their own completion history" ON "tasks";
DROP POLICY IF EXISTS "Users can view their own fitness history" ON "tasks";
DROP POLICY IF EXISTS "fitness_completion_history_delete" ON "tasks";
DROP POLICY IF EXISTS "fitness_completion_history_insert" ON "tasks";
DROP POLICY IF EXISTS "fitness_completion_history_select" ON "tasks";
DROP POLICY IF EXISTS "fitness_completion_history_update" ON "tasks";
DROP POLICY IF EXISTS "tasks_rls_select" ON "tasks";
DROP POLICY IF EXISTS "tasks_rls_insert" ON "tasks";
DROP POLICY IF EXISTS "tasks_rls_update" ON "tasks";
DROP POLICY IF EXISTS "tasks_rls_delete" ON "tasks";

ALTER TABLE "tasks" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tasks_rls_select" ON "tasks" FOR SELECT USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "tasks_rls_insert" ON "tasks" FOR INSERT WITH CHECK (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "tasks_rls_update" ON "tasks" FOR UPDATE USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "tasks_rls_delete" ON "tasks" FOR DELETE USING (user_id::text = (select current_setting('app.current_user_id')));

-- ----------------------------------------------------------------
-- motivation_content
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "Users can create own motivation content" ON "motivation_content";
DROP POLICY IF EXISTS "Users can delete own motivation content" ON "motivation_content";
DROP POLICY IF EXISTS "Users can update own motivation content" ON "motivation_content";
DROP POLICY IF EXISTS "Users can view own motivation content" ON "motivation_content";
DROP POLICY IF EXISTS "motivation_content_delete" ON "motivation_content";
DROP POLICY IF EXISTS "motivation_content_insert" ON "motivation_content";
DROP POLICY IF EXISTS "motivation_content_select" ON "motivation_content";
DROP POLICY IF EXISTS "motivation_content_update" ON "motivation_content";
DROP POLICY IF EXISTS "motivation_content_rls_select" ON "motivation_content";
DROP POLICY IF EXISTS "motivation_content_rls_insert" ON "motivation_content";
DROP POLICY IF EXISTS "motivation_content_rls_update" ON "motivation_content";
DROP POLICY IF EXISTS "motivation_content_rls_delete" ON "motivation_content";

ALTER TABLE "motivation_content" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "motivation_content_rls_select" ON "motivation_content" FOR SELECT USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "motivation_content_rls_insert" ON "motivation_content" FOR INSERT WITH CHECK (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "motivation_content_rls_update" ON "motivation_content" FOR UPDATE USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "motivation_content_rls_delete" ON "motivation_content" FOR DELETE USING (user_id::text = (select current_setting('app.current_user_id')));

-- ----------------------------------------------------------------
-- notepad
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "Users can delete own notepad" ON "notepad";
DROP POLICY IF EXISTS "Users can insert own notepad" ON "notepad";
DROP POLICY IF EXISTS "Users can update own notepad" ON "notepad";
DROP POLICY IF EXISTS "Users can view own notepad" ON "notepad";
DROP POLICY IF EXISTS "notepad_delete" ON "notepad";
DROP POLICY IF EXISTS "notepad_insert" ON "notepad";
DROP POLICY IF EXISTS "notepad_select" ON "notepad";
DROP POLICY IF EXISTS "notepad_update" ON "notepad";
DROP POLICY IF EXISTS "notepad_rls_select" ON "notepad";
DROP POLICY IF EXISTS "notepad_rls_insert" ON "notepad";
DROP POLICY IF EXISTS "notepad_rls_update" ON "notepad";
DROP POLICY IF EXISTS "notepad_rls_delete" ON "notepad";

ALTER TABLE "notepad" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notepad_rls_select" ON "notepad" FOR SELECT USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "notepad_rls_insert" ON "notepad" FOR INSERT WITH CHECK (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "notepad_rls_update" ON "notepad" FOR UPDATE USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "notepad_rls_delete" ON "notepad" FOR DELETE USING (user_id::text = (select current_setting('app.current_user_id')));

-- ----------------------------------------------------------------
-- shipments
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "Users can create own shipments" ON "shipments";
DROP POLICY IF EXISTS "Users can delete own shipments" ON "shipments";
DROP POLICY IF EXISTS "Users can update own shipments" ON "shipments";
DROP POLICY IF EXISTS "Users can view own shipments" ON "shipments";
DROP POLICY IF EXISTS "shipments_delete" ON "shipments";
DROP POLICY IF EXISTS "shipments_insert" ON "shipments";
DROP POLICY IF EXISTS "shipments_select" ON "shipments";
DROP POLICY IF EXISTS "shipments_update" ON "shipments";
DROP POLICY IF EXISTS "shipments_rls_select" ON "shipments";
DROP POLICY IF EXISTS "shipments_rls_insert" ON "shipments";
DROP POLICY IF EXISTS "shipments_rls_update" ON "shipments";
DROP POLICY IF EXISTS "shipments_rls_delete" ON "shipments";

ALTER TABLE "shipments" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shipments_rls_select" ON "shipments" FOR SELECT USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "shipments_rls_insert" ON "shipments" FOR INSERT WITH CHECK (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "shipments_rls_update" ON "shipments" FOR UPDATE USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "shipments_rls_delete" ON "shipments" FOR DELETE USING (user_id::text = (select current_setting('app.current_user_id')));

-- ----------------------------------------------------------------
-- module_settings
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "Users can manage their own module settings" ON "module_settings";
DROP POLICY IF EXISTS "module_settings_delete" ON "module_settings";
DROP POLICY IF EXISTS "module_settings_insert" ON "module_settings";
DROP POLICY IF EXISTS "module_settings_select" ON "module_settings";
DROP POLICY IF EXISTS "module_settings_update" ON "module_settings";
DROP POLICY IF EXISTS "module_settings_rls_select" ON "module_settings";
DROP POLICY IF EXISTS "module_settings_rls_insert" ON "module_settings";
DROP POLICY IF EXISTS "module_settings_rls_update" ON "module_settings";
DROP POLICY IF EXISTS "module_settings_rls_delete" ON "module_settings";

ALTER TABLE "module_settings" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "module_settings_rls_select" ON "module_settings" FOR SELECT USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "module_settings_rls_insert" ON "module_settings" FOR INSERT WITH CHECK (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "module_settings_rls_update" ON "module_settings" FOR UPDATE USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "module_settings_rls_delete" ON "module_settings" FOR DELETE USING (user_id::text = (select current_setting('app.current_user_id')));

-- ----------------------------------------------------------------
-- contacts
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view their own contacts" ON "contacts";
DROP POLICY IF EXISTS "contacts_delete" ON "contacts";
DROP POLICY IF EXISTS "contacts_insert" ON "contacts";
DROP POLICY IF EXISTS "contacts_select" ON "contacts";
DROP POLICY IF EXISTS "contacts_update" ON "contacts";
DROP POLICY IF EXISTS "contacts_rls_select" ON "contacts";
DROP POLICY IF EXISTS "contacts_rls_insert" ON "contacts";
DROP POLICY IF EXISTS "contacts_rls_update" ON "contacts";
DROP POLICY IF EXISTS "contacts_rls_delete" ON "contacts";

ALTER TABLE "contacts" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contacts_rls_select" ON "contacts" FOR SELECT USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "contacts_rls_insert" ON "contacts" FOR INSERT WITH CHECK (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "contacts_rls_update" ON "contacts" FOR UPDATE USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "contacts_rls_delete" ON "contacts" FOR DELETE USING (user_id::text = (select current_setting('app.current_user_id')));

-- ----------------------------------------------------------------
-- hyrox_workouts
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "Users can delete their own hyrox workouts" ON "hyrox_workouts";
DROP POLICY IF EXISTS "Users can insert their own hyrox workouts" ON "hyrox_workouts";
DROP POLICY IF EXISTS "Users can update their own hyrox workouts" ON "hyrox_workouts";
DROP POLICY IF EXISTS "Users can view their own Hyrox workouts" ON "hyrox_workouts";
DROP POLICY IF EXISTS "Users can view their own hyrox workouts" ON "hyrox_workouts";
DROP POLICY IF EXISTS "hyrox_workouts_delete" ON "hyrox_workouts";
DROP POLICY IF EXISTS "hyrox_workouts_insert" ON "hyrox_workouts";
DROP POLICY IF EXISTS "hyrox_workouts_select" ON "hyrox_workouts";
DROP POLICY IF EXISTS "hyrox_workouts_update" ON "hyrox_workouts";
DROP POLICY IF EXISTS "authenticated_access" ON "hyrox_workouts";
DROP POLICY IF EXISTS "hyrox_workouts_rls_select" ON "hyrox_workouts";
DROP POLICY IF EXISTS "hyrox_workouts_rls_insert" ON "hyrox_workouts";
DROP POLICY IF EXISTS "hyrox_workouts_rls_update" ON "hyrox_workouts";
DROP POLICY IF EXISTS "hyrox_workouts_rls_delete" ON "hyrox_workouts";

ALTER TABLE "hyrox_workouts" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hyrox_workouts_rls_select" ON "hyrox_workouts" FOR SELECT USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "hyrox_workouts_rls_insert" ON "hyrox_workouts" FOR INSERT WITH CHECK (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "hyrox_workouts_rls_update" ON "hyrox_workouts" FOR UPDATE USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "hyrox_workouts_rls_delete" ON "hyrox_workouts" FOR DELETE USING (user_id::text = (select current_setting('app.current_user_id')));

-- ----------------------------------------------------------------
-- hyrox_workout_stations
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "Users can delete their own hyrox records" ON "hyrox_workout_stations";
DROP POLICY IF EXISTS "Users can delete their own hyrox station records" ON "hyrox_workout_stations";
DROP POLICY IF EXISTS "Users can insert their own hyrox records" ON "hyrox_workout_stations";
DROP POLICY IF EXISTS "Users can insert their own hyrox station records" ON "hyrox_workout_stations";
DROP POLICY IF EXISTS "Users can update their own hyrox records" ON "hyrox_workout_stations";
DROP POLICY IF EXISTS "Users can update their own hyrox station records" ON "hyrox_workout_stations";
DROP POLICY IF EXISTS "Users can view their own hyrox records" ON "hyrox_workout_stations";
DROP POLICY IF EXISTS "Users can view their own hyrox station records" ON "hyrox_workout_stations";
DROP POLICY IF EXISTS "hyrox_station_records_delete" ON "hyrox_workout_stations";
DROP POLICY IF EXISTS "hyrox_station_records_insert" ON "hyrox_workout_stations";
DROP POLICY IF EXISTS "hyrox_station_records_select" ON "hyrox_workout_stations";
DROP POLICY IF EXISTS "hyrox_station_records_update" ON "hyrox_workout_stations";
DROP POLICY IF EXISTS "hyrox_workout_stations_rls_select" ON "hyrox_workout_stations";
DROP POLICY IF EXISTS "hyrox_workout_stations_rls_insert" ON "hyrox_workout_stations";
DROP POLICY IF EXISTS "hyrox_workout_stations_rls_update" ON "hyrox_workout_stations";
DROP POLICY IF EXISTS "hyrox_workout_stations_rls_delete" ON "hyrox_workout_stations";

ALTER TABLE "hyrox_workout_stations" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hyrox_workout_stations_rls_select" ON "hyrox_workout_stations" FOR SELECT USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "hyrox_workout_stations_rls_insert" ON "hyrox_workout_stations" FOR INSERT WITH CHECK (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "hyrox_workout_stations_rls_update" ON "hyrox_workout_stations" FOR UPDATE USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "hyrox_workout_stations_rls_delete" ON "hyrox_workout_stations" FOR DELETE USING (user_id::text = (select current_setting('app.current_user_id')));

-- ----------------------------------------------------------------
-- journal
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "Users can delete their own journal entries" ON "journal";
DROP POLICY IF EXISTS "Users can insert their own journal entries" ON "journal";
DROP POLICY IF EXISTS "Users can update their own journal entries" ON "journal";
DROP POLICY IF EXISTS "Users can view their own journal entries" ON "journal";
DROP POLICY IF EXISTS "journal_delete" ON "journal";
DROP POLICY IF EXISTS "journal_insert" ON "journal";
DROP POLICY IF EXISTS "journal_select" ON "journal";
DROP POLICY IF EXISTS "journal_update" ON "journal";
DROP POLICY IF EXISTS "journal_rls_select" ON "journal";
DROP POLICY IF EXISTS "journal_rls_insert" ON "journal";
DROP POLICY IF EXISTS "journal_rls_update" ON "journal";
DROP POLICY IF EXISTS "journal_rls_delete" ON "journal";

ALTER TABLE "journal" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "journal_rls_select" ON "journal" FOR SELECT USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "journal_rls_insert" ON "journal" FOR INSERT WITH CHECK (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "journal_rls_update" ON "journal" FOR UPDATE USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "journal_rls_delete" ON "journal" FOR DELETE USING (user_id::text = (select current_setting('app.current_user_id')));

-- ----------------------------------------------------------------
-- user_feature_preferences
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "Users can delete their own feature preferences" ON "user_feature_preferences";
DROP POLICY IF EXISTS "Users can insert their own feature preferences" ON "user_feature_preferences";
DROP POLICY IF EXISTS "Users can update their own feature preferences" ON "user_feature_preferences";
DROP POLICY IF EXISTS "Users can view their own feature preferences" ON "user_feature_preferences";
DROP POLICY IF EXISTS "user_feature_preferences_delete" ON "user_feature_preferences";
DROP POLICY IF EXISTS "user_feature_preferences_insert" ON "user_feature_preferences";
DROP POLICY IF EXISTS "user_feature_preferences_select" ON "user_feature_preferences";
DROP POLICY IF EXISTS "user_feature_preferences_update" ON "user_feature_preferences";
DROP POLICY IF EXISTS "user_feature_preferences_rls_select" ON "user_feature_preferences";
DROP POLICY IF EXISTS "user_feature_preferences_rls_insert" ON "user_feature_preferences";
DROP POLICY IF EXISTS "user_feature_preferences_rls_update" ON "user_feature_preferences";
DROP POLICY IF EXISTS "user_feature_preferences_rls_delete" ON "user_feature_preferences";

ALTER TABLE "user_feature_preferences" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_feature_preferences_rls_select" ON "user_feature_preferences" FOR SELECT USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "user_feature_preferences_rls_insert" ON "user_feature_preferences" FOR INSERT WITH CHECK (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "user_feature_preferences_rls_update" ON "user_feature_preferences" FOR UPDATE USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "user_feature_preferences_rls_delete" ON "user_feature_preferences" FOR DELETE USING (user_id::text = (select current_setting('app.current_user_id')));

-- ----------------------------------------------------------------
-- hello_world_entries
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "Users can delete their own hello world entries" ON "hello_world_entries";
DROP POLICY IF EXISTS "Users can insert their own hello world entries" ON "hello_world_entries";
DROP POLICY IF EXISTS "Users can update their own hello world entries" ON "hello_world_entries";
DROP POLICY IF EXISTS "Users can view their own hello world entries" ON "hello_world_entries";
DROP POLICY IF EXISTS "hello_world_entries_delete" ON "hello_world_entries";
DROP POLICY IF EXISTS "hello_world_entries_insert" ON "hello_world_entries";
DROP POLICY IF EXISTS "hello_world_entries_select" ON "hello_world_entries";
DROP POLICY IF EXISTS "hello_world_entries_update" ON "hello_world_entries";
DROP POLICY IF EXISTS "hello_world_entries_rls_select" ON "hello_world_entries";
DROP POLICY IF EXISTS "hello_world_entries_rls_insert" ON "hello_world_entries";
DROP POLICY IF EXISTS "hello_world_entries_rls_update" ON "hello_world_entries";
DROP POLICY IF EXISTS "hello_world_entries_rls_delete" ON "hello_world_entries";

ALTER TABLE "hello_world_entries" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hello_world_entries_rls_select" ON "hello_world_entries" FOR SELECT USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "hello_world_entries_rls_insert" ON "hello_world_entries" FOR INSERT WITH CHECK (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "hello_world_entries_rls_update" ON "hello_world_entries" FOR UPDATE USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "hello_world_entries_rls_delete" ON "hello_world_entries" FOR DELETE USING (user_id::text = (select current_setting('app.current_user_id')));

-- ----------------------------------------------------------------
-- major_projects
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "Users can delete their own projects" ON "major_projects";
DROP POLICY IF EXISTS "Users can insert their own projects" ON "major_projects";
DROP POLICY IF EXISTS "Users can update their own projects" ON "major_projects";
DROP POLICY IF EXISTS "Users can view their own projects" ON "major_projects";
DROP POLICY IF EXISTS "major_projects_delete" ON "major_projects";
DROP POLICY IF EXISTS "major_projects_insert" ON "major_projects";
DROP POLICY IF EXISTS "major_projects_select" ON "major_projects";
DROP POLICY IF EXISTS "major_projects_update" ON "major_projects";
DROP POLICY IF EXISTS "major_projects_rls_select" ON "major_projects";
DROP POLICY IF EXISTS "major_projects_rls_insert" ON "major_projects";
DROP POLICY IF EXISTS "major_projects_rls_update" ON "major_projects";
DROP POLICY IF EXISTS "major_projects_rls_delete" ON "major_projects";

ALTER TABLE "major_projects" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "major_projects_rls_select" ON "major_projects" FOR SELECT USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "major_projects_rls_insert" ON "major_projects" FOR INSERT WITH CHECK (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "major_projects_rls_update" ON "major_projects" FOR UPDATE USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "major_projects_rls_delete" ON "major_projects" FOR DELETE USING (user_id::text = (select current_setting('app.current_user_id')));

-- ----------------------------------------------------------------
-- contribution_graph
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "Users can delete own contribution graph" ON "contribution_graph";
DROP POLICY IF EXISTS "Users can insert own contribution graph" ON "contribution_graph";
DROP POLICY IF EXISTS "Users can update own contribution graph" ON "contribution_graph";
DROP POLICY IF EXISTS "Users can view own contribution graph" ON "contribution_graph";
DROP POLICY IF EXISTS "contribution_graph_delete" ON "contribution_graph";
DROP POLICY IF EXISTS "contribution_graph_insert" ON "contribution_graph";
DROP POLICY IF EXISTS "contribution_graph_select" ON "contribution_graph";
DROP POLICY IF EXISTS "contribution_graph_update" ON "contribution_graph";
DROP POLICY IF EXISTS "contribution_graph_rls_select" ON "contribution_graph";
DROP POLICY IF EXISTS "contribution_graph_rls_insert" ON "contribution_graph";
DROP POLICY IF EXISTS "contribution_graph_rls_update" ON "contribution_graph";
DROP POLICY IF EXISTS "contribution_graph_rls_delete" ON "contribution_graph";

ALTER TABLE "contribution_graph" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contribution_graph_rls_select" ON "contribution_graph" FOR SELECT USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "contribution_graph_rls_insert" ON "contribution_graph" FOR INSERT WITH CHECK (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "contribution_graph_rls_update" ON "contribution_graph" FOR UPDATE USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "contribution_graph_rls_delete" ON "contribution_graph" FOR DELETE USING (user_id::text = (select current_setting('app.current_user_id')));

-- ----------------------------------------------------------------
-- winter_arc_goals
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "Users can delete their own winter arc goals" ON "winter_arc_goals";
DROP POLICY IF EXISTS "Users can insert their own winter arc goals" ON "winter_arc_goals";
DROP POLICY IF EXISTS "Users can update their own winter arc goals" ON "winter_arc_goals";
DROP POLICY IF EXISTS "Users can view their own winter arc goals" ON "winter_arc_goals";
DROP POLICY IF EXISTS "winter_arc_goals_delete" ON "winter_arc_goals";
DROP POLICY IF EXISTS "winter_arc_goals_insert" ON "winter_arc_goals";
DROP POLICY IF EXISTS "winter_arc_goals_select" ON "winter_arc_goals";
DROP POLICY IF EXISTS "winter_arc_goals_update" ON "winter_arc_goals";
DROP POLICY IF EXISTS "winter_arc_goals_rls_select" ON "winter_arc_goals";
DROP POLICY IF EXISTS "winter_arc_goals_rls_insert" ON "winter_arc_goals";
DROP POLICY IF EXISTS "winter_arc_goals_rls_update" ON "winter_arc_goals";
DROP POLICY IF EXISTS "winter_arc_goals_rls_delete" ON "winter_arc_goals";

ALTER TABLE "winter_arc_goals" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "winter_arc_goals_rls_select" ON "winter_arc_goals" FOR SELECT USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "winter_arc_goals_rls_insert" ON "winter_arc_goals" FOR INSERT WITH CHECK (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "winter_arc_goals_rls_update" ON "winter_arc_goals" FOR UPDATE USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "winter_arc_goals_rls_delete" ON "winter_arc_goals" FOR DELETE USING (user_id::text = (select current_setting('app.current_user_id')));

-- ----------------------------------------------------------------
-- quotes
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view their own quotes" ON "quotes";
DROP POLICY IF EXISTS "quotes_delete" ON "quotes";
DROP POLICY IF EXISTS "quotes_insert" ON "quotes";
DROP POLICY IF EXISTS "quotes_select" ON "quotes";
DROP POLICY IF EXISTS "quotes_update" ON "quotes";
DROP POLICY IF EXISTS "quotes_rls_select" ON "quotes";
DROP POLICY IF EXISTS "quotes_rls_insert" ON "quotes";
DROP POLICY IF EXISTS "quotes_rls_update" ON "quotes";
DROP POLICY IF EXISTS "quotes_rls_delete" ON "quotes";

ALTER TABLE "quotes" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "quotes_rls_select" ON "quotes" FOR SELECT USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "quotes_rls_insert" ON "quotes" FOR INSERT WITH CHECK (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "quotes_rls_update" ON "quotes" FOR UPDATE USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "quotes_rls_delete" ON "quotes" FOR DELETE USING (user_id::text = (select current_setting('app.current_user_id')));

-- ----------------------------------------------------------------
-- travel
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "Users can delete their own travel tasks" ON "travel";
DROP POLICY IF EXISTS "Users can insert their own travel tasks" ON "travel";
DROP POLICY IF EXISTS "Users can update their own travel tasks" ON "travel";
DROP POLICY IF EXISTS "Users can view their own travel tasks" ON "travel";
DROP POLICY IF EXISTS "travel_delete" ON "travel";
DROP POLICY IF EXISTS "travel_insert" ON "travel";
DROP POLICY IF EXISTS "travel_select" ON "travel";
DROP POLICY IF EXISTS "travel_update" ON "travel";
DROP POLICY IF EXISTS "travel_rls_select" ON "travel";
DROP POLICY IF EXISTS "travel_rls_insert" ON "travel";
DROP POLICY IF EXISTS "travel_rls_update" ON "travel";
DROP POLICY IF EXISTS "travel_rls_delete" ON "travel";

ALTER TABLE "travel" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "travel_rls_select" ON "travel" FOR SELECT USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "travel_rls_insert" ON "travel" FOR INSERT WITH CHECK (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "travel_rls_update" ON "travel" FOR UPDATE USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "travel_rls_delete" ON "travel" FOR DELETE USING (user_id::text = (select current_setting('app.current_user_id')));

-- ----------------------------------------------------------------
-- travel_activities
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "Users can delete their own travel activities" ON "travel_activities";
DROP POLICY IF EXISTS "Users can insert their own travel activities" ON "travel_activities";
DROP POLICY IF EXISTS "Users can update their own travel activities" ON "travel_activities";
DROP POLICY IF EXISTS "Users can view their own travel activities" ON "travel_activities";
DROP POLICY IF EXISTS "travel_activities_delete" ON "travel_activities";
DROP POLICY IF EXISTS "travel_activities_insert" ON "travel_activities";
DROP POLICY IF EXISTS "travel_activities_select" ON "travel_activities";
DROP POLICY IF EXISTS "travel_activities_update" ON "travel_activities";
DROP POLICY IF EXISTS "travel_activities_rls_select" ON "travel_activities";
DROP POLICY IF EXISTS "travel_activities_rls_insert" ON "travel_activities";
DROP POLICY IF EXISTS "travel_activities_rls_update" ON "travel_activities";
DROP POLICY IF EXISTS "travel_activities_rls_delete" ON "travel_activities";

ALTER TABLE "travel_activities" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "travel_activities_rls_select" ON "travel_activities" FOR SELECT USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "travel_activities_rls_insert" ON "travel_activities" FOR INSERT WITH CHECK (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "travel_activities_rls_update" ON "travel_activities" FOR UPDATE USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "travel_activities_rls_delete" ON "travel_activities" FOR DELETE USING (user_id::text = (select current_setting('app.current_user_id')));

-- ----------------------------------------------------------------
-- travel_flights
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view their own travel flights" ON "travel_flights";
DROP POLICY IF EXISTS "Users can insert their own travel flights" ON "travel_flights";
DROP POLICY IF EXISTS "Users can update their own travel flights" ON "travel_flights";
DROP POLICY IF EXISTS "Users can delete their own travel flights" ON "travel_flights";
DROP POLICY IF EXISTS "travel_flights_rls_select" ON "travel_flights";
DROP POLICY IF EXISTS "travel_flights_rls_insert" ON "travel_flights";
DROP POLICY IF EXISTS "travel_flights_rls_update" ON "travel_flights";
DROP POLICY IF EXISTS "travel_flights_rls_delete" ON "travel_flights";

ALTER TABLE "travel_flights" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "travel_flights_rls_select" ON "travel_flights" FOR SELECT USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "travel_flights_rls_insert" ON "travel_flights" FOR INSERT WITH CHECK (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "travel_flights_rls_update" ON "travel_flights" FOR UPDATE USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "travel_flights_rls_delete" ON "travel_flights" FOR DELETE USING (user_id::text = (select current_setting('app.current_user_id')));

-- ----------------------------------------------------------------
-- ohtani_grid_cells
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "Users can delete their own ohtani grid cells" ON "ohtani_grid_cells";
DROP POLICY IF EXISTS "Users can insert their own ohtani grid cells" ON "ohtani_grid_cells";
DROP POLICY IF EXISTS "Users can update their own ohtani grid cells" ON "ohtani_grid_cells";
DROP POLICY IF EXISTS "Users can view their own ohtani grid cells" ON "ohtani_grid_cells";
DROP POLICY IF EXISTS "ohtani_grid_cells_delete" ON "ohtani_grid_cells";
DROP POLICY IF EXISTS "ohtani_grid_cells_insert" ON "ohtani_grid_cells";
DROP POLICY IF EXISTS "ohtani_grid_cells_select" ON "ohtani_grid_cells";
DROP POLICY IF EXISTS "ohtani_grid_cells_update" ON "ohtani_grid_cells";
DROP POLICY IF EXISTS "ohtani_grid_cells_rls_select" ON "ohtani_grid_cells";
DROP POLICY IF EXISTS "ohtani_grid_cells_rls_insert" ON "ohtani_grid_cells";
DROP POLICY IF EXISTS "ohtani_grid_cells_rls_update" ON "ohtani_grid_cells";
DROP POLICY IF EXISTS "ohtani_grid_cells_rls_delete" ON "ohtani_grid_cells";

ALTER TABLE "ohtani_grid_cells" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ohtani_grid_cells_rls_select" ON "ohtani_grid_cells" FOR SELECT USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "ohtani_grid_cells_rls_insert" ON "ohtani_grid_cells" FOR INSERT WITH CHECK (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "ohtani_grid_cells_rls_update" ON "ohtani_grid_cells" FOR UPDATE USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "ohtani_grid_cells_rls_delete" ON "ohtani_grid_cells" FOR DELETE USING (user_id::text = (select current_setting('app.current_user_id')));

-- ----------------------------------------------------------------
-- knowledge_articles
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "knowledge_articles_delete" ON "knowledge_articles";
DROP POLICY IF EXISTS "knowledge_articles_insert" ON "knowledge_articles";
DROP POLICY IF EXISTS "knowledge_articles_select" ON "knowledge_articles";
DROP POLICY IF EXISTS "knowledge_articles_update" ON "knowledge_articles";
DROP POLICY IF EXISTS "knowledge_articles_rls_select" ON "knowledge_articles";
DROP POLICY IF EXISTS "knowledge_articles_rls_insert" ON "knowledge_articles";
DROP POLICY IF EXISTS "knowledge_articles_rls_update" ON "knowledge_articles";
DROP POLICY IF EXISTS "knowledge_articles_rls_delete" ON "knowledge_articles";

ALTER TABLE "knowledge_articles" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "knowledge_articles_rls_select" ON "knowledge_articles" FOR SELECT USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "knowledge_articles_rls_insert" ON "knowledge_articles" FOR INSERT WITH CHECK (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "knowledge_articles_rls_update" ON "knowledge_articles" FOR UPDATE USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "knowledge_articles_rls_delete" ON "knowledge_articles" FOR DELETE USING (user_id::text = (select current_setting('app.current_user_id')));

-- ----------------------------------------------------------------
-- knowledge_collections
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "knowledge_collections_delete" ON "knowledge_collections";
DROP POLICY IF EXISTS "knowledge_collections_insert" ON "knowledge_collections";
DROP POLICY IF EXISTS "knowledge_collections_select" ON "knowledge_collections";
DROP POLICY IF EXISTS "knowledge_collections_update" ON "knowledge_collections";
DROP POLICY IF EXISTS "knowledge_collections_rls_select" ON "knowledge_collections";
DROP POLICY IF EXISTS "knowledge_collections_rls_insert" ON "knowledge_collections";
DROP POLICY IF EXISTS "knowledge_collections_rls_update" ON "knowledge_collections";
DROP POLICY IF EXISTS "knowledge_collections_rls_delete" ON "knowledge_collections";

ALTER TABLE "knowledge_collections" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "knowledge_collections_rls_select" ON "knowledge_collections" FOR SELECT USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "knowledge_collections_rls_insert" ON "knowledge_collections" FOR INSERT WITH CHECK (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "knowledge_collections_rls_update" ON "knowledge_collections" FOR UPDATE USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "knowledge_collections_rls_delete" ON "knowledge_collections" FOR DELETE USING (user_id::text = (select current_setting('app.current_user_id')));

-- ----------------------------------------------------------------
-- ari_launch_entries
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view their own ari_launch_entries" ON "ari_launch_entries";
DROP POLICY IF EXISTS "Users can insert their own ari_launch_entries" ON "ari_launch_entries";
DROP POLICY IF EXISTS "Users can update their own ari_launch_entries" ON "ari_launch_entries";
DROP POLICY IF EXISTS "Users can delete their own ari_launch_entries" ON "ari_launch_entries";
DROP POLICY IF EXISTS "ari_launch_entries_select" ON "ari_launch_entries";
DROP POLICY IF EXISTS "ari_launch_entries_insert" ON "ari_launch_entries";
DROP POLICY IF EXISTS "ari_launch_entries_update" ON "ari_launch_entries";
DROP POLICY IF EXISTS "ari_launch_entries_delete" ON "ari_launch_entries";
DROP POLICY IF EXISTS "ari_launch_entries_rls_select" ON "ari_launch_entries";
DROP POLICY IF EXISTS "ari_launch_entries_rls_insert" ON "ari_launch_entries";
DROP POLICY IF EXISTS "ari_launch_entries_rls_update" ON "ari_launch_entries";
DROP POLICY IF EXISTS "ari_launch_entries_rls_delete" ON "ari_launch_entries";

ALTER TABLE "ari_launch_entries" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ari_launch_entries_rls_select" ON "ari_launch_entries" FOR SELECT USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "ari_launch_entries_rls_insert" ON "ari_launch_entries" FOR INSERT WITH CHECK (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "ari_launch_entries_rls_update" ON "ari_launch_entries" FOR UPDATE USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "ari_launch_entries_rls_delete" ON "ari_launch_entries" FOR DELETE USING (user_id::text = (select current_setting('app.current_user_id')));

-- ================================================================
-- ADDITIONAL USER DATA TABLES (TEXT user_id — no cast needed)
-- Pattern: user_id = (select current_setting('app.current_user_id'))
-- ================================================================

-- ----------------------------------------------------------------
-- hyrox_station_records
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "hyrox_station_records_delete" ON "hyrox_station_records";
DROP POLICY IF EXISTS "hyrox_station_records_insert" ON "hyrox_station_records";
DROP POLICY IF EXISTS "hyrox_station_records_select" ON "hyrox_station_records";
DROP POLICY IF EXISTS "hyrox_station_records_update" ON "hyrox_station_records";
DROP POLICY IF EXISTS "hyrox_station_records_rls_select" ON "hyrox_station_records";
DROP POLICY IF EXISTS "hyrox_station_records_rls_insert" ON "hyrox_station_records";
DROP POLICY IF EXISTS "hyrox_station_records_rls_update" ON "hyrox_station_records";
DROP POLICY IF EXISTS "hyrox_station_records_rls_delete" ON "hyrox_station_records";

ALTER TABLE "hyrox_station_records" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hyrox_station_records_rls_select" ON "hyrox_station_records" FOR SELECT USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "hyrox_station_records_rls_insert" ON "hyrox_station_records" FOR INSERT WITH CHECK (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "hyrox_station_records_rls_update" ON "hyrox_station_records" FOR UPDATE USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "hyrox_station_records_rls_delete" ON "hyrox_station_records" FOR DELETE USING (user_id::text = (select current_setting('app.current_user_id')));

-- ----------------------------------------------------------------
-- memento_settings
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "memento_settings_rls_select" ON "memento_settings";
DROP POLICY IF EXISTS "memento_settings_rls_insert" ON "memento_settings";
DROP POLICY IF EXISTS "memento_settings_rls_update" ON "memento_settings";
DROP POLICY IF EXISTS "memento_settings_rls_delete" ON "memento_settings";

ALTER TABLE "memento_settings" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "memento_settings_rls_select" ON "memento_settings" FOR SELECT USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "memento_settings_rls_insert" ON "memento_settings" FOR INSERT WITH CHECK (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "memento_settings_rls_update" ON "memento_settings" FOR UPDATE USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "memento_settings_rls_delete" ON "memento_settings" FOR DELETE USING (user_id::text = (select current_setting('app.current_user_id')));

-- ----------------------------------------------------------------
-- memento_milestones
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "memento_milestones_rls_select" ON "memento_milestones";
DROP POLICY IF EXISTS "memento_milestones_rls_insert" ON "memento_milestones";
DROP POLICY IF EXISTS "memento_milestones_rls_update" ON "memento_milestones";
DROP POLICY IF EXISTS "memento_milestones_rls_delete" ON "memento_milestones";

ALTER TABLE "memento_milestones" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "memento_milestones_rls_select" ON "memento_milestones" FOR SELECT USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "memento_milestones_rls_insert" ON "memento_milestones" FOR INSERT WITH CHECK (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "memento_milestones_rls_update" ON "memento_milestones" FOR UPDATE USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "memento_milestones_rls_delete" ON "memento_milestones" FOR DELETE USING (user_id::text = (select current_setting('app.current_user_id')));

-- ----------------------------------------------------------------
-- memento_eras
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "memento_eras_rls_select" ON "memento_eras";
DROP POLICY IF EXISTS "memento_eras_rls_insert" ON "memento_eras";
DROP POLICY IF EXISTS "memento_eras_rls_update" ON "memento_eras";
DROP POLICY IF EXISTS "memento_eras_rls_delete" ON "memento_eras";

ALTER TABLE "memento_eras" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "memento_eras_rls_select" ON "memento_eras" FOR SELECT USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "memento_eras_rls_insert" ON "memento_eras" FOR INSERT WITH CHECK (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "memento_eras_rls_update" ON "memento_eras" FOR UPDATE USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "memento_eras_rls_delete" ON "memento_eras" FOR DELETE USING (user_id::text = (select current_setting('app.current_user_id')));

-- ----------------------------------------------------------------
-- user_preferences
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "user_preferences_rls_select" ON "user_preferences";
DROP POLICY IF EXISTS "user_preferences_rls_insert" ON "user_preferences";
DROP POLICY IF EXISTS "user_preferences_rls_update" ON "user_preferences";
DROP POLICY IF EXISTS "user_preferences_rls_delete" ON "user_preferences";

ALTER TABLE "user_preferences" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_preferences_rls_select" ON "user_preferences" FOR SELECT USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "user_preferences_rls_insert" ON "user_preferences" FOR INSERT WITH CHECK (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "user_preferences_rls_update" ON "user_preferences" FOR UPDATE USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "user_preferences_rls_delete" ON "user_preferences" FOR DELETE USING (user_id::text = (select current_setting('app.current_user_id')));

-- ----------------------------------------------------------------
-- backup_metadata
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "backup_metadata_rls_select" ON "backup_metadata";
DROP POLICY IF EXISTS "backup_metadata_rls_insert" ON "backup_metadata";
DROP POLICY IF EXISTS "backup_metadata_rls_update" ON "backup_metadata";
DROP POLICY IF EXISTS "backup_metadata_rls_delete" ON "backup_metadata";

ALTER TABLE "backup_metadata" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backup_metadata_rls_select" ON "backup_metadata" FOR SELECT USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "backup_metadata_rls_insert" ON "backup_metadata" FOR INSERT WITH CHECK (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "backup_metadata_rls_update" ON "backup_metadata" FOR UPDATE USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "backup_metadata_rls_delete" ON "backup_metadata" FOR DELETE USING (user_id::text = (select current_setting('app.current_user_id')));

-- ----------------------------------------------------------------
-- document_folders
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "document_folders_rls_select" ON "document_folders";
DROP POLICY IF EXISTS "document_folders_rls_insert" ON "document_folders";
DROP POLICY IF EXISTS "document_folders_rls_update" ON "document_folders";
DROP POLICY IF EXISTS "document_folders_rls_delete" ON "document_folders";

ALTER TABLE "document_folders" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "document_folders_rls_select" ON "document_folders" FOR SELECT USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "document_folders_rls_insert" ON "document_folders" FOR INSERT WITH CHECK (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "document_folders_rls_update" ON "document_folders" FOR UPDATE USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "document_folders_rls_delete" ON "document_folders" FOR DELETE USING (user_id::text = (select current_setting('app.current_user_id')));

-- ----------------------------------------------------------------
-- documents
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "documents_rls_select" ON "documents";
DROP POLICY IF EXISTS "documents_rls_insert" ON "documents";
DROP POLICY IF EXISTS "documents_rls_update" ON "documents";
DROP POLICY IF EXISTS "documents_rls_delete" ON "documents";

ALTER TABLE "documents" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "documents_rls_select" ON "documents" FOR SELECT USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "documents_rls_insert" ON "documents" FOR INSERT WITH CHECK (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "documents_rls_update" ON "documents" FOR UPDATE USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "documents_rls_delete" ON "documents" FOR DELETE USING (user_id::text = (select current_setting('app.current_user_id')));

-- ----------------------------------------------------------------
-- document_tags
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "document_tags_rls_select" ON "document_tags";
DROP POLICY IF EXISTS "document_tags_rls_insert" ON "document_tags";
DROP POLICY IF EXISTS "document_tags_rls_update" ON "document_tags";
DROP POLICY IF EXISTS "document_tags_rls_delete" ON "document_tags";

ALTER TABLE "document_tags" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "document_tags_rls_select" ON "document_tags" FOR SELECT USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "document_tags_rls_insert" ON "document_tags" FOR INSERT WITH CHECK (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "document_tags_rls_update" ON "document_tags" FOR UPDATE USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "document_tags_rls_delete" ON "document_tags" FOR DELETE USING (user_id::text = (select current_setting('app.current_user_id')));

-- ----------------------------------------------------------------
-- baseball_teams
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "baseball_teams_rls_select" ON "baseball_teams";
DROP POLICY IF EXISTS "baseball_teams_rls_insert" ON "baseball_teams";
DROP POLICY IF EXISTS "baseball_teams_rls_update" ON "baseball_teams";
DROP POLICY IF EXISTS "baseball_teams_rls_delete" ON "baseball_teams";

ALTER TABLE "baseball_teams" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "baseball_teams_rls_select" ON "baseball_teams" FOR SELECT USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "baseball_teams_rls_insert" ON "baseball_teams" FOR INSERT WITH CHECK (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "baseball_teams_rls_update" ON "baseball_teams" FOR UPDATE USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "baseball_teams_rls_delete" ON "baseball_teams" FOR DELETE USING (user_id::text = (select current_setting('app.current_user_id')));

-- ----------------------------------------------------------------
-- baseball_players
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "baseball_players_rls_select" ON "baseball_players";
DROP POLICY IF EXISTS "baseball_players_rls_insert" ON "baseball_players";
DROP POLICY IF EXISTS "baseball_players_rls_update" ON "baseball_players";
DROP POLICY IF EXISTS "baseball_players_rls_delete" ON "baseball_players";

ALTER TABLE "baseball_players" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "baseball_players_rls_select" ON "baseball_players" FOR SELECT USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "baseball_players_rls_insert" ON "baseball_players" FOR INSERT WITH CHECK (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "baseball_players_rls_update" ON "baseball_players" FOR UPDATE USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "baseball_players_rls_delete" ON "baseball_players" FOR DELETE USING (user_id::text = (select current_setting('app.current_user_id')));

-- ----------------------------------------------------------------
-- prospects
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "prospects_rls_select" ON "prospects";
DROP POLICY IF EXISTS "prospects_rls_insert" ON "prospects";
DROP POLICY IF EXISTS "prospects_rls_update" ON "prospects";
DROP POLICY IF EXISTS "prospects_rls_delete" ON "prospects";

ALTER TABLE "prospects" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prospects_rls_select" ON "prospects" FOR SELECT USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "prospects_rls_insert" ON "prospects" FOR INSERT WITH CHECK (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "prospects_rls_update" ON "prospects" FOR UPDATE USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "prospects_rls_delete" ON "prospects" FOR DELETE USING (user_id::text = (select current_setting('app.current_user_id')));

-- ================================================================
-- BETTER AUTH SYSTEM TABLES — keep permissive (managed by Better Auth)
-- ================================================================

-- user table: Better Auth manages this directly
DROP POLICY IF EXISTS "Users can update own profile" ON "user";
DROP POLICY IF EXISTS "Users can view own profile" ON "user";
DROP POLICY IF EXISTS "user_all_operations" ON "user";
DROP POLICY IF EXISTS "user_select_own" ON "user";
DROP POLICY IF EXISTS "user_rls_all" ON "user";

ALTER TABLE "user" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_rls_all" ON "user" FOR ALL USING (true) WITH CHECK (true);

-- session table
DROP POLICY IF EXISTS "Users can delete own sessions" ON "session";
DROP POLICY IF EXISTS "Users can view own sessions" ON "session";
DROP POLICY IF EXISTS "session_all_operations" ON "session";
DROP POLICY IF EXISTS "session_select_own" ON "session";
DROP POLICY IF EXISTS "session_rls_all" ON "session";

ALTER TABLE "session" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "session_rls_all" ON "session" FOR ALL USING (true) WITH CHECK (true);

-- account table
DROP POLICY IF EXISTS "Users can view own accounts" ON "account";
DROP POLICY IF EXISTS "account_all_operations" ON "account";
DROP POLICY IF EXISTS "account_select_own" ON "account";
DROP POLICY IF EXISTS "account_rls_all" ON "account";

ALTER TABLE "account" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "account_rls_all" ON "account" FOR ALL USING (true) WITH CHECK (true);

-- verification table
DROP POLICY IF EXISTS "verification_all_operations" ON "verification";
DROP POLICY IF EXISTS "verification_rls_all" ON "verification";

ALTER TABLE "verification" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "verification_rls_all" ON "verification" FOR ALL USING (true) WITH CHECK (true);

-- twoFactor table
DROP POLICY IF EXISTS "twoFactor_all_operations" ON "twoFactor";
DROP POLICY IF EXISTS "twoFactor_rls_all" ON "twoFactor";

ALTER TABLE "twoFactor" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "twoFactor_rls_all" ON "twoFactor" FOR ALL USING (true) WITH CHECK (true);

-- ================================================================
-- GLOBAL / NO user_id TABLES — keep permissive
-- ================================================================

-- module_migrations: global table, no user_id
DROP POLICY IF EXISTS "All users can view module migrations" ON "module_migrations";
DROP POLICY IF EXISTS "Service role can manage migrations" ON "module_migrations";
DROP POLICY IF EXISTS "module_migrations_rls_all" ON "module_migrations";

ALTER TABLE "module_migrations" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "module_migrations_rls_all" ON "module_migrations" FOR ALL USING (true) WITH CHECK (true);

-- mail_stream_events: global table, no user_id
ALTER TABLE "mail_stream_events" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mail_stream_events_rls_all" ON "mail_stream_events";
CREATE POLICY "mail_stream_events_rls_all" ON "mail_stream_events" FOR ALL USING (true) WITH CHECK (true);

-- mail_stream_settings: global table, no user_id
ALTER TABLE "mail_stream_settings" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mail_stream_settings_rls_all" ON "mail_stream_settings";
CREATE POLICY "mail_stream_settings_rls_all" ON "mail_stream_settings" FOR ALL USING (true) WITH CHECK (true);

-- document_tag_assignments: no user_id (linked via document -> user)
ALTER TABLE "document_tag_assignments" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "document_tag_assignments_rls_all" ON "document_tag_assignments";
CREATE POLICY "document_tag_assignments_rls_all" ON "document_tag_assignments" FOR ALL USING (true) WITH CHECK (true);

-- ================================================================
-- FITNESS_COMPLETION_HISTORY (if exists as separate table)
-- ================================================================
-- Note: The schema shows fitness_completion_history policies on the "tasks" table.
-- If fitness_completion_history exists as a separate table, uncomment below:
--
-- ALTER TABLE "fitness_completion_history" ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "fitness_completion_history_rls_select" ON "fitness_completion_history" FOR SELECT USING (user_id::text = (select current_setting('app.current_user_id')));
-- CREATE POLICY "fitness_completion_history_rls_insert" ON "fitness_completion_history" FOR INSERT WITH CHECK (user_id::text = (select current_setting('app.current_user_id')));
-- CREATE POLICY "fitness_completion_history_rls_update" ON "fitness_completion_history" FOR UPDATE USING (user_id::text = (select current_setting('app.current_user_id')));
-- CREATE POLICY "fitness_completion_history_rls_delete" ON "fitness_completion_history" FOR DELETE USING (user_id::text = (select current_setting('app.current_user_id')));

COMMIT;

-- ================================================================
-- DIAGNOSTIC: Run after migration to verify policies
-- ================================================================
-- Check your current role's privileges:
SELECT current_user, current_setting('is_superuser') as is_superuser;

-- List all RLS policies to verify:
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- Check which tables have RLS enabled:
SELECT relname, relrowsecurity
FROM pg_class
WHERE relnamespace = 'public'::regnamespace
  AND relkind = 'r'
ORDER BY relname;
