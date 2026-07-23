-- ============================================================================
-- MANUAL TEARDOWN SCRIPT — DO NOT RUN AUTOMATICALLY
-- ============================================================================
-- This file is NEVER executed by the ARI module loader.
-- It exists only so a user can run it in their SQL client of choice
-- (Supabase Studio, pgweb, or psql) to remove this module's tables.
--
-- Running this will PERMANENTLY DELETE all data in the listed tables.
-- ============================================================================

-- Drop in reverse FK order: uploads + messages reference conversations.
DROP TABLE IF EXISTS chat_uploads CASCADE;
DROP TABLE IF EXISTS chat_messages CASCADE;
DROP TABLE IF EXISTS chat_conversations CASCADE;
