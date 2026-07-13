-- ============================================================================
-- MANUAL TEARDOWN SCRIPT — DO NOT RUN AUTOMATICALLY
-- ============================================================================
-- This file is NEVER executed by the ARI module loader.
-- It exists only so a user can run it in their SQL client of choice
-- (Supabase Studio, pgweb, or psql) to remove this module's tables.
--
-- Running this will PERMANENTLY DELETE all data in the listed tables.
-- ============================================================================

-- Child tables first (all reference health_data_imports)
DROP TABLE IF EXISTS health_data_routes CASCADE;
DROP TABLE IF EXISTS health_data_ecgs CASCADE;
DROP TABLE IF EXISTS health_data_sleep_nights CASCADE;
DROP TABLE IF EXISTS health_data_activity_days CASCADE;
DROP TABLE IF EXISTS health_data_workouts CASCADE;
DROP TABLE IF EXISTS health_data_daily_metrics CASCADE;
DROP TABLE IF EXISTS health_data_imports CASCADE;
