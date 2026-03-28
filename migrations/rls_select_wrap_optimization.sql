-- ================================================================
-- RLS POLICY OPTIMIZATION: Wrap current_setting() in a subselect
-- ================================================================
--
-- PostgreSQL evaluates RLS policy expressions once per row by default.
-- Wrapping current_setting('app.current_user_id') in a scalar subselect
-- (select current_setting('app.current_user_id')) causes the planner to
-- evaluate it once as an InitPlan and cache the result for the entire
-- query, avoiding repeated function calls on every row.
--
-- This migration drops and recreates ALL RLS policies from
-- fix_rls_policies.sql with the optimized (select ...) pattern.
-- ================================================================

BEGIN;

-- ----------------------------------------------------------------
-- notepad_revisions
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "notepad_revisions_rls_select" ON "notepad_revisions";
DROP POLICY IF EXISTS "notepad_revisions_rls_insert" ON "notepad_revisions";
DROP POLICY IF EXISTS "notepad_revisions_rls_update" ON "notepad_revisions";
DROP POLICY IF EXISTS "notepad_revisions_rls_delete" ON "notepad_revisions";

CREATE POLICY "notepad_revisions_rls_select" ON "notepad_revisions" FOR SELECT USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "notepad_revisions_rls_insert" ON "notepad_revisions" FOR INSERT WITH CHECK (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "notepad_revisions_rls_update" ON "notepad_revisions" FOR UPDATE USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "notepad_revisions_rls_delete" ON "notepad_revisions" FOR DELETE USING (user_id::text = (select current_setting('app.current_user_id')));

-- ----------------------------------------------------------------
-- fitness_database
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "fitness_database_rls_select" ON "fitness_database";
DROP POLICY IF EXISTS "fitness_database_rls_insert" ON "fitness_database";
DROP POLICY IF EXISTS "fitness_database_rls_update" ON "fitness_database";
DROP POLICY IF EXISTS "fitness_database_rls_delete" ON "fitness_database";

CREATE POLICY "fitness_database_rls_select" ON "fitness_database" FOR SELECT USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "fitness_database_rls_insert" ON "fitness_database" FOR INSERT WITH CHECK (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "fitness_database_rls_update" ON "fitness_database" FOR UPDATE USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "fitness_database_rls_delete" ON "fitness_database" FOR DELETE USING (user_id::text = (select current_setting('app.current_user_id')));

-- ----------------------------------------------------------------
-- gratitude_entries
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "gratitude_entries_rls_select" ON "gratitude_entries";
DROP POLICY IF EXISTS "gratitude_entries_rls_insert" ON "gratitude_entries";
DROP POLICY IF EXISTS "gratitude_entries_rls_update" ON "gratitude_entries";
DROP POLICY IF EXISTS "gratitude_entries_rls_delete" ON "gratitude_entries";

CREATE POLICY "gratitude_entries_rls_select" ON "gratitude_entries" FOR SELECT USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "gratitude_entries_rls_insert" ON "gratitude_entries" FOR INSERT WITH CHECK (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "gratitude_entries_rls_update" ON "gratitude_entries" FOR UPDATE USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "gratitude_entries_rls_delete" ON "gratitude_entries" FOR DELETE USING (user_id::text = (select current_setting('app.current_user_id')));

-- ----------------------------------------------------------------
-- northstar
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "northstar_rls_select" ON "northstar";
DROP POLICY IF EXISTS "northstar_rls_insert" ON "northstar";
DROP POLICY IF EXISTS "northstar_rls_update" ON "northstar";
DROP POLICY IF EXISTS "northstar_rls_delete" ON "northstar";

CREATE POLICY "northstar_rls_select" ON "northstar" FOR SELECT USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "northstar_rls_insert" ON "northstar" FOR INSERT WITH CHECK (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "northstar_rls_update" ON "northstar" FOR UPDATE USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "northstar_rls_delete" ON "northstar" FOR DELETE USING (user_id::text = (select current_setting('app.current_user_id')));

-- ----------------------------------------------------------------
-- tasks
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "tasks_rls_select" ON "tasks";
DROP POLICY IF EXISTS "tasks_rls_insert" ON "tasks";
DROP POLICY IF EXISTS "tasks_rls_update" ON "tasks";
DROP POLICY IF EXISTS "tasks_rls_delete" ON "tasks";

CREATE POLICY "tasks_rls_select" ON "tasks" FOR SELECT USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "tasks_rls_insert" ON "tasks" FOR INSERT WITH CHECK (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "tasks_rls_update" ON "tasks" FOR UPDATE USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "tasks_rls_delete" ON "tasks" FOR DELETE USING (user_id::text = (select current_setting('app.current_user_id')));

-- ----------------------------------------------------------------
-- motivation_content
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "motivation_content_rls_select" ON "motivation_content";
DROP POLICY IF EXISTS "motivation_content_rls_insert" ON "motivation_content";
DROP POLICY IF EXISTS "motivation_content_rls_update" ON "motivation_content";
DROP POLICY IF EXISTS "motivation_content_rls_delete" ON "motivation_content";

CREATE POLICY "motivation_content_rls_select" ON "motivation_content" FOR SELECT USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "motivation_content_rls_insert" ON "motivation_content" FOR INSERT WITH CHECK (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "motivation_content_rls_update" ON "motivation_content" FOR UPDATE USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "motivation_content_rls_delete" ON "motivation_content" FOR DELETE USING (user_id::text = (select current_setting('app.current_user_id')));

-- ----------------------------------------------------------------
-- notepad
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "notepad_rls_select" ON "notepad";
DROP POLICY IF EXISTS "notepad_rls_insert" ON "notepad";
DROP POLICY IF EXISTS "notepad_rls_update" ON "notepad";
DROP POLICY IF EXISTS "notepad_rls_delete" ON "notepad";

CREATE POLICY "notepad_rls_select" ON "notepad" FOR SELECT USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "notepad_rls_insert" ON "notepad" FOR INSERT WITH CHECK (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "notepad_rls_update" ON "notepad" FOR UPDATE USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "notepad_rls_delete" ON "notepad" FOR DELETE USING (user_id::text = (select current_setting('app.current_user_id')));

-- ----------------------------------------------------------------
-- shipments
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "shipments_rls_select" ON "shipments";
DROP POLICY IF EXISTS "shipments_rls_insert" ON "shipments";
DROP POLICY IF EXISTS "shipments_rls_update" ON "shipments";
DROP POLICY IF EXISTS "shipments_rls_delete" ON "shipments";

CREATE POLICY "shipments_rls_select" ON "shipments" FOR SELECT USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "shipments_rls_insert" ON "shipments" FOR INSERT WITH CHECK (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "shipments_rls_update" ON "shipments" FOR UPDATE USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "shipments_rls_delete" ON "shipments" FOR DELETE USING (user_id::text = (select current_setting('app.current_user_id')));

-- ----------------------------------------------------------------
-- module_settings
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "module_settings_rls_select" ON "module_settings";
DROP POLICY IF EXISTS "module_settings_rls_insert" ON "module_settings";
DROP POLICY IF EXISTS "module_settings_rls_update" ON "module_settings";
DROP POLICY IF EXISTS "module_settings_rls_delete" ON "module_settings";

CREATE POLICY "module_settings_rls_select" ON "module_settings" FOR SELECT USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "module_settings_rls_insert" ON "module_settings" FOR INSERT WITH CHECK (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "module_settings_rls_update" ON "module_settings" FOR UPDATE USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "module_settings_rls_delete" ON "module_settings" FOR DELETE USING (user_id::text = (select current_setting('app.current_user_id')));

-- ----------------------------------------------------------------
-- contacts
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "contacts_rls_select" ON "contacts";
DROP POLICY IF EXISTS "contacts_rls_insert" ON "contacts";
DROP POLICY IF EXISTS "contacts_rls_update" ON "contacts";
DROP POLICY IF EXISTS "contacts_rls_delete" ON "contacts";

CREATE POLICY "contacts_rls_select" ON "contacts" FOR SELECT USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "contacts_rls_insert" ON "contacts" FOR INSERT WITH CHECK (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "contacts_rls_update" ON "contacts" FOR UPDATE USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "contacts_rls_delete" ON "contacts" FOR DELETE USING (user_id::text = (select current_setting('app.current_user_id')));

-- ----------------------------------------------------------------
-- hyrox_workouts
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "hyrox_workouts_rls_select" ON "hyrox_workouts";
DROP POLICY IF EXISTS "hyrox_workouts_rls_insert" ON "hyrox_workouts";
DROP POLICY IF EXISTS "hyrox_workouts_rls_update" ON "hyrox_workouts";
DROP POLICY IF EXISTS "hyrox_workouts_rls_delete" ON "hyrox_workouts";

CREATE POLICY "hyrox_workouts_rls_select" ON "hyrox_workouts" FOR SELECT USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "hyrox_workouts_rls_insert" ON "hyrox_workouts" FOR INSERT WITH CHECK (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "hyrox_workouts_rls_update" ON "hyrox_workouts" FOR UPDATE USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "hyrox_workouts_rls_delete" ON "hyrox_workouts" FOR DELETE USING (user_id::text = (select current_setting('app.current_user_id')));

-- ----------------------------------------------------------------
-- hyrox_workout_stations
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "hyrox_workout_stations_rls_select" ON "hyrox_workout_stations";
DROP POLICY IF EXISTS "hyrox_workout_stations_rls_insert" ON "hyrox_workout_stations";
DROP POLICY IF EXISTS "hyrox_workout_stations_rls_update" ON "hyrox_workout_stations";
DROP POLICY IF EXISTS "hyrox_workout_stations_rls_delete" ON "hyrox_workout_stations";

CREATE POLICY "hyrox_workout_stations_rls_select" ON "hyrox_workout_stations" FOR SELECT USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "hyrox_workout_stations_rls_insert" ON "hyrox_workout_stations" FOR INSERT WITH CHECK (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "hyrox_workout_stations_rls_update" ON "hyrox_workout_stations" FOR UPDATE USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "hyrox_workout_stations_rls_delete" ON "hyrox_workout_stations" FOR DELETE USING (user_id::text = (select current_setting('app.current_user_id')));

-- ----------------------------------------------------------------
-- journal
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "journal_rls_select" ON "journal";
DROP POLICY IF EXISTS "journal_rls_insert" ON "journal";
DROP POLICY IF EXISTS "journal_rls_update" ON "journal";
DROP POLICY IF EXISTS "journal_rls_delete" ON "journal";

CREATE POLICY "journal_rls_select" ON "journal" FOR SELECT USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "journal_rls_insert" ON "journal" FOR INSERT WITH CHECK (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "journal_rls_update" ON "journal" FOR UPDATE USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "journal_rls_delete" ON "journal" FOR DELETE USING (user_id::text = (select current_setting('app.current_user_id')));

-- ----------------------------------------------------------------
-- user_feature_preferences
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "user_feature_preferences_rls_select" ON "user_feature_preferences";
DROP POLICY IF EXISTS "user_feature_preferences_rls_insert" ON "user_feature_preferences";
DROP POLICY IF EXISTS "user_feature_preferences_rls_update" ON "user_feature_preferences";
DROP POLICY IF EXISTS "user_feature_preferences_rls_delete" ON "user_feature_preferences";

CREATE POLICY "user_feature_preferences_rls_select" ON "user_feature_preferences" FOR SELECT USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "user_feature_preferences_rls_insert" ON "user_feature_preferences" FOR INSERT WITH CHECK (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "user_feature_preferences_rls_update" ON "user_feature_preferences" FOR UPDATE USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "user_feature_preferences_rls_delete" ON "user_feature_preferences" FOR DELETE USING (user_id::text = (select current_setting('app.current_user_id')));

-- ----------------------------------------------------------------
-- hello_world_entries
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "hello_world_entries_rls_select" ON "hello_world_entries";
DROP POLICY IF EXISTS "hello_world_entries_rls_insert" ON "hello_world_entries";
DROP POLICY IF EXISTS "hello_world_entries_rls_update" ON "hello_world_entries";
DROP POLICY IF EXISTS "hello_world_entries_rls_delete" ON "hello_world_entries";

CREATE POLICY "hello_world_entries_rls_select" ON "hello_world_entries" FOR SELECT USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "hello_world_entries_rls_insert" ON "hello_world_entries" FOR INSERT WITH CHECK (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "hello_world_entries_rls_update" ON "hello_world_entries" FOR UPDATE USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "hello_world_entries_rls_delete" ON "hello_world_entries" FOR DELETE USING (user_id::text = (select current_setting('app.current_user_id')));

-- ----------------------------------------------------------------
-- major_projects
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "major_projects_rls_select" ON "major_projects";
DROP POLICY IF EXISTS "major_projects_rls_insert" ON "major_projects";
DROP POLICY IF EXISTS "major_projects_rls_update" ON "major_projects";
DROP POLICY IF EXISTS "major_projects_rls_delete" ON "major_projects";

CREATE POLICY "major_projects_rls_select" ON "major_projects" FOR SELECT USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "major_projects_rls_insert" ON "major_projects" FOR INSERT WITH CHECK (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "major_projects_rls_update" ON "major_projects" FOR UPDATE USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "major_projects_rls_delete" ON "major_projects" FOR DELETE USING (user_id::text = (select current_setting('app.current_user_id')));

-- ----------------------------------------------------------------
-- contribution_graph
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "contribution_graph_rls_select" ON "contribution_graph";
DROP POLICY IF EXISTS "contribution_graph_rls_insert" ON "contribution_graph";
DROP POLICY IF EXISTS "contribution_graph_rls_update" ON "contribution_graph";
DROP POLICY IF EXISTS "contribution_graph_rls_delete" ON "contribution_graph";

CREATE POLICY "contribution_graph_rls_select" ON "contribution_graph" FOR SELECT USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "contribution_graph_rls_insert" ON "contribution_graph" FOR INSERT WITH CHECK (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "contribution_graph_rls_update" ON "contribution_graph" FOR UPDATE USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "contribution_graph_rls_delete" ON "contribution_graph" FOR DELETE USING (user_id::text = (select current_setting('app.current_user_id')));

-- ----------------------------------------------------------------
-- winter_arc_goals
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "winter_arc_goals_rls_select" ON "winter_arc_goals";
DROP POLICY IF EXISTS "winter_arc_goals_rls_insert" ON "winter_arc_goals";
DROP POLICY IF EXISTS "winter_arc_goals_rls_update" ON "winter_arc_goals";
DROP POLICY IF EXISTS "winter_arc_goals_rls_delete" ON "winter_arc_goals";

CREATE POLICY "winter_arc_goals_rls_select" ON "winter_arc_goals" FOR SELECT USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "winter_arc_goals_rls_insert" ON "winter_arc_goals" FOR INSERT WITH CHECK (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "winter_arc_goals_rls_update" ON "winter_arc_goals" FOR UPDATE USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "winter_arc_goals_rls_delete" ON "winter_arc_goals" FOR DELETE USING (user_id::text = (select current_setting('app.current_user_id')));

-- ----------------------------------------------------------------
-- quotes
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "quotes_rls_select" ON "quotes";
DROP POLICY IF EXISTS "quotes_rls_insert" ON "quotes";
DROP POLICY IF EXISTS "quotes_rls_update" ON "quotes";
DROP POLICY IF EXISTS "quotes_rls_delete" ON "quotes";

CREATE POLICY "quotes_rls_select" ON "quotes" FOR SELECT USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "quotes_rls_insert" ON "quotes" FOR INSERT WITH CHECK (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "quotes_rls_update" ON "quotes" FOR UPDATE USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "quotes_rls_delete" ON "quotes" FOR DELETE USING (user_id::text = (select current_setting('app.current_user_id')));

-- ----------------------------------------------------------------
-- travel
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "travel_rls_select" ON "travel";
DROP POLICY IF EXISTS "travel_rls_insert" ON "travel";
DROP POLICY IF EXISTS "travel_rls_update" ON "travel";
DROP POLICY IF EXISTS "travel_rls_delete" ON "travel";

CREATE POLICY "travel_rls_select" ON "travel" FOR SELECT USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "travel_rls_insert" ON "travel" FOR INSERT WITH CHECK (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "travel_rls_update" ON "travel" FOR UPDATE USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "travel_rls_delete" ON "travel" FOR DELETE USING (user_id::text = (select current_setting('app.current_user_id')));

-- ----------------------------------------------------------------
-- travel_activities
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "travel_activities_rls_select" ON "travel_activities";
DROP POLICY IF EXISTS "travel_activities_rls_insert" ON "travel_activities";
DROP POLICY IF EXISTS "travel_activities_rls_update" ON "travel_activities";
DROP POLICY IF EXISTS "travel_activities_rls_delete" ON "travel_activities";

CREATE POLICY "travel_activities_rls_select" ON "travel_activities" FOR SELECT USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "travel_activities_rls_insert" ON "travel_activities" FOR INSERT WITH CHECK (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "travel_activities_rls_update" ON "travel_activities" FOR UPDATE USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "travel_activities_rls_delete" ON "travel_activities" FOR DELETE USING (user_id::text = (select current_setting('app.current_user_id')));

-- ----------------------------------------------------------------
-- travel_flights
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "travel_flights_rls_select" ON "travel_flights";
DROP POLICY IF EXISTS "travel_flights_rls_insert" ON "travel_flights";
DROP POLICY IF EXISTS "travel_flights_rls_update" ON "travel_flights";
DROP POLICY IF EXISTS "travel_flights_rls_delete" ON "travel_flights";

CREATE POLICY "travel_flights_rls_select" ON "travel_flights" FOR SELECT USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "travel_flights_rls_insert" ON "travel_flights" FOR INSERT WITH CHECK (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "travel_flights_rls_update" ON "travel_flights" FOR UPDATE USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "travel_flights_rls_delete" ON "travel_flights" FOR DELETE USING (user_id::text = (select current_setting('app.current_user_id')));

-- ----------------------------------------------------------------
-- ohtani_grid_cells
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "ohtani_grid_cells_rls_select" ON "ohtani_grid_cells";
DROP POLICY IF EXISTS "ohtani_grid_cells_rls_insert" ON "ohtani_grid_cells";
DROP POLICY IF EXISTS "ohtani_grid_cells_rls_update" ON "ohtani_grid_cells";
DROP POLICY IF EXISTS "ohtani_grid_cells_rls_delete" ON "ohtani_grid_cells";

CREATE POLICY "ohtani_grid_cells_rls_select" ON "ohtani_grid_cells" FOR SELECT USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "ohtani_grid_cells_rls_insert" ON "ohtani_grid_cells" FOR INSERT WITH CHECK (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "ohtani_grid_cells_rls_update" ON "ohtani_grid_cells" FOR UPDATE USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "ohtani_grid_cells_rls_delete" ON "ohtani_grid_cells" FOR DELETE USING (user_id::text = (select current_setting('app.current_user_id')));

-- ----------------------------------------------------------------
-- knowledge_articles
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "knowledge_articles_rls_select" ON "knowledge_articles";
DROP POLICY IF EXISTS "knowledge_articles_rls_insert" ON "knowledge_articles";
DROP POLICY IF EXISTS "knowledge_articles_rls_update" ON "knowledge_articles";
DROP POLICY IF EXISTS "knowledge_articles_rls_delete" ON "knowledge_articles";

CREATE POLICY "knowledge_articles_rls_select" ON "knowledge_articles" FOR SELECT USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "knowledge_articles_rls_insert" ON "knowledge_articles" FOR INSERT WITH CHECK (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "knowledge_articles_rls_update" ON "knowledge_articles" FOR UPDATE USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "knowledge_articles_rls_delete" ON "knowledge_articles" FOR DELETE USING (user_id::text = (select current_setting('app.current_user_id')));

-- ----------------------------------------------------------------
-- knowledge_collections
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "knowledge_collections_rls_select" ON "knowledge_collections";
DROP POLICY IF EXISTS "knowledge_collections_rls_insert" ON "knowledge_collections";
DROP POLICY IF EXISTS "knowledge_collections_rls_update" ON "knowledge_collections";
DROP POLICY IF EXISTS "knowledge_collections_rls_delete" ON "knowledge_collections";

CREATE POLICY "knowledge_collections_rls_select" ON "knowledge_collections" FOR SELECT USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "knowledge_collections_rls_insert" ON "knowledge_collections" FOR INSERT WITH CHECK (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "knowledge_collections_rls_update" ON "knowledge_collections" FOR UPDATE USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "knowledge_collections_rls_delete" ON "knowledge_collections" FOR DELETE USING (user_id::text = (select current_setting('app.current_user_id')));

-- ----------------------------------------------------------------
-- ari_launch_entries
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "ari_launch_entries_rls_select" ON "ari_launch_entries";
DROP POLICY IF EXISTS "ari_launch_entries_rls_insert" ON "ari_launch_entries";
DROP POLICY IF EXISTS "ari_launch_entries_rls_update" ON "ari_launch_entries";
DROP POLICY IF EXISTS "ari_launch_entries_rls_delete" ON "ari_launch_entries";

CREATE POLICY "ari_launch_entries_rls_select" ON "ari_launch_entries" FOR SELECT USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "ari_launch_entries_rls_insert" ON "ari_launch_entries" FOR INSERT WITH CHECK (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "ari_launch_entries_rls_update" ON "ari_launch_entries" FOR UPDATE USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "ari_launch_entries_rls_delete" ON "ari_launch_entries" FOR DELETE USING (user_id::text = (select current_setting('app.current_user_id')));

-- ----------------------------------------------------------------
-- hyrox_station_records
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "hyrox_station_records_rls_select" ON "hyrox_station_records";
DROP POLICY IF EXISTS "hyrox_station_records_rls_insert" ON "hyrox_station_records";
DROP POLICY IF EXISTS "hyrox_station_records_rls_update" ON "hyrox_station_records";
DROP POLICY IF EXISTS "hyrox_station_records_rls_delete" ON "hyrox_station_records";

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

CREATE POLICY "prospects_rls_select" ON "prospects" FOR SELECT USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "prospects_rls_insert" ON "prospects" FOR INSERT WITH CHECK (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "prospects_rls_update" ON "prospects" FOR UPDATE USING (user_id::text = (select current_setting('app.current_user_id')));
CREATE POLICY "prospects_rls_delete" ON "prospects" FOR DELETE USING (user_id::text = (select current_setting('app.current_user_id')));

-- ----------------------------------------------------------------
-- Better Auth system tables (permissive, no change needed but
-- included for completeness to match fix_rls_policies.sql)
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "user_rls_all" ON "user";
CREATE POLICY "user_rls_all" ON "user" FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "session_rls_all" ON "session";
CREATE POLICY "session_rls_all" ON "session" FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "account_rls_all" ON "account";
CREATE POLICY "account_rls_all" ON "account" FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "verification_rls_all" ON "verification";
CREATE POLICY "verification_rls_all" ON "verification" FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "twoFactor_rls_all" ON "twoFactor";
CREATE POLICY "twoFactor_rls_all" ON "twoFactor" FOR ALL USING (true) WITH CHECK (true);

-- ----------------------------------------------------------------
-- Global / no user_id tables (permissive, no change needed but
-- included for completeness to match fix_rls_policies.sql)
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "module_migrations_rls_all" ON "module_migrations";
CREATE POLICY "module_migrations_rls_all" ON "module_migrations" FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "mail_stream_events_rls_all" ON "mail_stream_events";
CREATE POLICY "mail_stream_events_rls_all" ON "mail_stream_events" FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "mail_stream_settings_rls_all" ON "mail_stream_settings";
CREATE POLICY "mail_stream_settings_rls_all" ON "mail_stream_settings" FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "document_tag_assignments_rls_all" ON "document_tag_assignments";
CREATE POLICY "document_tag_assignments_rls_all" ON "document_tag_assignments" FOR ALL USING (true) WITH CHECK (true);

COMMIT;
