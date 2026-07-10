-- ============================================================================
-- MANUAL TEARDOWN SCRIPT — DO NOT RUN AUTOMATICALLY
-- ============================================================================
-- This file is NEVER executed by the ARI module loader.
-- It exists only so a user can run it in their SQL client of choice
-- (Supabase Studio, pgweb, or psql) to remove this module's tables.
--
-- Running this will PERMANENTLY DELETE all data in the listed tables,
-- including stored Google OAuth tokens. After running it the user will need
-- to reconnect Google Calendar if they re-enable the module.
-- ============================================================================

DROP TABLE IF EXISTS morning_brief_greetings CASCADE;
DROP TABLE IF EXISTS morning_brief_google_tokens CASCADE;
