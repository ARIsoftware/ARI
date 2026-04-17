-- Havoc Companions Module — Uninstall
--
-- WARNING: This file is MANUAL ONLY. It is never auto-run by the module
-- system. Run it from the Supabase SQL editor only when you want to wipe
-- havoc-companions settings.
--
-- This module does not own any tables, so the only state to remove is the
-- per-user row(s) in the shared `module_settings` table.
--
-- WARNING: When run from the SQL editor with service-role privileges this
-- statement deletes havoc-companions settings for ALL USERS, not just the
-- current one. To target a single user, replace the WHERE clause with:
--   WHERE module_id = 'havoc-companions' AND user_id = '<paste-user-id>';

DELETE FROM module_settings WHERE module_id = 'havoc-companions';
