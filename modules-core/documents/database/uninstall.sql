-- ============================================================================
-- MANUAL TEARDOWN SCRIPT — DO NOT RUN AUTOMATICALLY
-- ============================================================================
-- This file is NEVER executed by the ARI module loader.
-- It exists only so a user can run it in their SQL client of choice
-- (Supabase Studio, pgweb, or psql) to remove this module's tables.
--
-- Running this will PERMANENTLY DELETE all data in the listed tables,
-- including every uploaded document's metadata row. The objects in the
-- configured cloud storage bucket are NOT removed by this script — delete
-- them manually from your storage provider if needed.
-- ============================================================================

DROP TABLE IF EXISTS document_tag_assignments CASCADE;
DROP TABLE IF EXISTS document_tags CASCADE;
DROP TABLE IF EXISTS documents CASCADE;
DROP TABLE IF EXISTS document_folders CASCADE;
