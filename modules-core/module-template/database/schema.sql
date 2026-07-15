-- Module Template schema
-- Idempotent: safe to run on every module enable.
-- Mirrors modules-core/module-template/database/schema.ts
--
-- ═══════════════════════════════════════════════════════════════════════════
-- MULTI-USER: is this table PER-USER (private) or SHARED (collaborative)?
-- ═══════════════════════════════════════════════════════════════════════════
-- ARI is multi-user. Every content table must decide who can see its rows:
--
--   • PER-USER (private) — DEFAULT, and what this template uses. Each user
--     only sees/edits their own rows (e.g. fitness, health, journal, notes).
--     RLS: match user_id = app.current_user_id on all four verbs.
--
--   • SHARED (collaborative) — all authenticated users read AND write the same
--     rows (e.g. tasks, contacts, documents). To make a table shared, change
--     the SELECT/UPDATE/DELETE policies below to use app.can_access_shared()
--     while keeping the INSERT WITH CHECK on user_id (so the creator is still
--     stamped as owner). app.can_access_shared() is defined in lib/db/setup.sql.
--       USING (app.can_access_shared())
--
-- IMPORTANT (see docs/SECURITY.md): the default DB role has BYPASSRLS, so these
-- policies are DEFENSE-IN-DEPTH, not the real boundary. The actual enforcement
-- lives in your API queries — a PER-USER table MUST filter every read/write by
-- user_id (see api/data/route.ts); a SHARED table must NOT. Keep the RLS policy
-- and the API filtering consistent with each other.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS module_template_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,   -- owner (the creator); required on every content table
  message VARCHAR(500) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_module_template_entries_user_id ON module_template_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_module_template_entries_created_at ON module_template_entries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_module_template_entries_user_created ON module_template_entries(user_id, created_at DESC);

ALTER TABLE module_template_entries ENABLE ROW LEVEL SECURITY;

-- PER-USER policies (default). For a SHARED table, replace the USING clause on
-- SELECT/UPDATE/DELETE with `app.can_access_shared()` and leave INSERT as-is.
DROP POLICY IF EXISTS module_template_entries_rls_select ON module_template_entries;
CREATE POLICY module_template_entries_rls_select ON module_template_entries FOR SELECT
  USING (user_id = (SELECT current_setting('app.current_user_id')));

-- INSERT always stamps the creator as owner — keep this on shared tables too.
DROP POLICY IF EXISTS module_template_entries_rls_insert ON module_template_entries;
CREATE POLICY module_template_entries_rls_insert ON module_template_entries FOR INSERT
  WITH CHECK (user_id = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS module_template_entries_rls_update ON module_template_entries;
CREATE POLICY module_template_entries_rls_update ON module_template_entries FOR UPDATE
  USING (user_id = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS module_template_entries_rls_delete ON module_template_entries;
CREATE POLICY module_template_entries_rls_delete ON module_template_entries FOR DELETE
  USING (user_id = (SELECT current_setting('app.current_user_id')));
