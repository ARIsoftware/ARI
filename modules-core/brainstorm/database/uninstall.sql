-- ============================================================================
-- MANUAL TEARDOWN SCRIPT — DO NOT RUN AUTOMATICALLY
-- ============================================================================
-- This file is NEVER executed by the ARI module loader.
-- It exists only so a user can run it in their SQL client of choice
-- (Supabase Studio, pgweb, or psql) to remove this module's tables.
--
-- Running this will PERMANENTLY DELETE all data in the listed tables.
-- ============================================================================

DROP TABLE IF EXISTS brainstorm_edges CASCADE;
DROP TABLE IF EXISTS brainstorm_nodes CASCADE;
DROP TABLE IF EXISTS brainstorm_boards CASCADE;
