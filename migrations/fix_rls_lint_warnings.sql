-- ================================================================
-- Fix Supabase RLS Lint Warnings
-- ================================================================
-- Resolves 9 WARN + 1 INFO from Supabase performance/security linter:
-- - Function search_path mutable on app.current_user_id
-- - RLS Policy Always True on auth/system tables
-- - RLS Enabled No Policy on user_preferences
--
-- Safe to run multiple times (idempotent).
-- ================================================================

BEGIN;

-- ================================================================
-- Fix 1: Set immutable search_path on app.current_user_id()
-- ================================================================

CREATE OR REPLACE FUNCTION app.current_user_id()
RETURNS TEXT AS $$
  SELECT current_setting('app.current_user_id', true);
$$ LANGUAGE sql STABLE SET search_path = '';

-- ================================================================
-- Fix 2: Replace USING (true) with USING (false) on service-role-only tables
-- These tables are only accessed via the service role (which bypasses RLS).
-- Denying non-service-role access is both correct and more secure.
-- ================================================================

-- user
DROP POLICY IF EXISTS "user_rls_all" ON "user";
DROP POLICY IF EXISTS "user_rls_deny" ON "user";
CREATE POLICY "user_rls_deny" ON "user" FOR ALL TO public USING (false);

-- session
DROP POLICY IF EXISTS "session_rls_all" ON "session";
DROP POLICY IF EXISTS "session_rls_deny" ON "session";
CREATE POLICY "session_rls_deny" ON "session" FOR ALL TO public USING (false);

-- account
DROP POLICY IF EXISTS "account_rls_all" ON "account";
DROP POLICY IF EXISTS "account_rls_deny" ON "account";
CREATE POLICY "account_rls_deny" ON "account" FOR ALL TO public USING (false);

-- twoFactor
DROP POLICY IF EXISTS "twoFactor_rls_all" ON "twoFactor";
DROP POLICY IF EXISTS "twoFactor_rls_deny" ON "twoFactor";
CREATE POLICY "twoFactor_rls_deny" ON "twoFactor" FOR ALL TO public USING (false);

-- verification
DROP POLICY IF EXISTS "verification_rls_all" ON "verification";
DROP POLICY IF EXISTS "verification_rls_deny" ON "verification";
CREATE POLICY "verification_rls_deny" ON "verification" FOR ALL TO public USING (false);

-- module_migrations
DROP POLICY IF EXISTS "module_migrations_rls_all" ON "module_migrations";
DROP POLICY IF EXISTS "module_migrations_rls_deny" ON "module_migrations";
CREATE POLICY "module_migrations_rls_deny" ON "module_migrations" FOR ALL TO public USING (false);

-- ari_instance
DROP POLICY IF EXISTS "ari_instance_rls_select" ON "ari_instance";
DROP POLICY IF EXISTS "ari_instance_rls_update" ON "ari_instance";
DROP POLICY IF EXISTS "ari_instance_rls_insert" ON "ari_instance";
DROP POLICY IF EXISTS "ari_instance_rls_deny" ON "ari_instance";
CREATE POLICY "ari_instance_rls_deny" ON "ari_instance" FOR ALL TO public USING (false);

-- ================================================================
-- Fix 3: Add user-scoped policies to user_preferences
-- ================================================================

DROP POLICY IF EXISTS "user_preferences_rls_select" ON "user_preferences";
CREATE POLICY "user_preferences_rls_select" ON "user_preferences" FOR SELECT TO public
  USING (user_id::text = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS "user_preferences_rls_insert" ON "user_preferences";
CREATE POLICY "user_preferences_rls_insert" ON "user_preferences" FOR INSERT TO public
  WITH CHECK (user_id::text = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS "user_preferences_rls_update" ON "user_preferences";
CREATE POLICY "user_preferences_rls_update" ON "user_preferences" FOR UPDATE TO public
  USING (user_id::text = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS "user_preferences_rls_delete" ON "user_preferences";
CREATE POLICY "user_preferences_rls_delete" ON "user_preferences" FOR DELETE TO public
  USING (user_id::text = (SELECT current_setting('app.current_user_id')));

COMMIT;
