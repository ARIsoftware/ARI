-- ============================================================================
-- MANUAL TEARDOWN SCRIPT — DO NOT RUN AUTOMATICALLY
-- ============================================================================
-- This file is NEVER executed by the ARI module loader.
-- It exists only so a user can manually remove this module's tables from
-- the database via the Supabase SQL editor if they want a clean uninstall.
--
-- Running this will PERMANENTLY DELETE all data in the listed tables.
-- ============================================================================

DROP TABLE IF EXISTS module_template_entries CASCADE;
