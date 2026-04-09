-- Havoc Companions Module — Schema
--
-- This module does not own any tables. It stores per-user settings in the
-- shared `module_settings` table's JSONB `settings` column under the
-- module_id 'havoc-companions'.
--
-- The shared `module_settings` table is created by the core schema and
-- already has RLS enforcement at the application level via withRLS().
--
-- This file exists only to satisfy the module convention. It is auto-run on
-- every module enable and intentionally contains no DDL.

-- Idempotent no-op so the runtime installer has something to execute.
DO $$
BEGIN
  -- havoc-companions uses module_settings; nothing to create.
  NULL;
END $$;
