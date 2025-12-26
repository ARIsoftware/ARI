-- ============================================
-- Migration 001: Portable RLS Setup
-- ============================================
--
-- PURPOSE:
-- Create infrastructure for RLS that works with any PostgreSQL database,
-- not just Supabase. Uses session variables instead of Supabase's auth.uid().
--
-- WHAT THIS CREATES:
-- 1. "app" schema for application functions
-- 2. app.current_user_id() function that reads the session variable
--
-- HOW IT WORKS:
-- 1. Application code calls: SET LOCAL app.current_user_id = '<user-id>'
-- 2. RLS policies call: app.current_user_id() to get the current user
-- 3. All queries are automatically filtered to that user's data
--
-- SECURITY:
-- - Returns NULL if not set (blocks all access - fail closed)
-- - DO NOT expose set_user_context as RPC (would allow impersonation)
-- - Only application server code should set the context
--
-- ============================================


-- ============================================
-- STEP 1: Create app schema
-- ============================================
-- Separate schema keeps application functions organized
-- and avoids conflicts with public schema

CREATE SCHEMA IF NOT EXISTS app;


-- ============================================
-- STEP 2: Create current_user_id() function
-- ============================================
-- IMPORTANT: Returns TEXT, not UUID!
--
-- Rationale:
-- 1. Better Auth stores user.id as TEXT (even though it's UUID format)
-- 2. All app tables use UUID columns for user_id
-- 3. PostgreSQL auto-casts TEXT→UUID when comparing to UUID columns
--    (as long as the text is valid UUID format like '550e8400-e29b-41d4-a716-446655440000')
-- 4. Returning TEXT avoids cast failures and works with both column types
--
-- The second parameter 'true' to current_setting means:
-- - Return NULL instead of error if the setting doesn't exist
-- - This is critical for fail-closed security

CREATE OR REPLACE FUNCTION app.current_user_id()
RETURNS TEXT AS $$
  SELECT NULLIF(current_setting('app.current_user_id', true), '');
$$ LANGUAGE SQL STABLE;


-- ============================================
-- STEP 3: Grant permissions
-- ============================================
-- PUBLIC needs access so RLS policies can call the function
-- This doesn't allow setting the context - only reading it

GRANT USAGE ON SCHEMA app TO PUBLIC;
GRANT EXECUTE ON FUNCTION app.current_user_id() TO PUBLIC;


-- ============================================
-- VERIFICATION QUERIES
-- ============================================
-- Run these after the migration to verify it worked

-- 1. Check schema exists:
/*
SELECT schema_name
FROM information_schema.schemata
WHERE schema_name = 'app';
-- Expected: 1 row with 'app'
*/

-- 2. Check function exists:
/*
SELECT routine_name, routine_schema, data_type
FROM information_schema.routines
WHERE routine_name = 'current_user_id' AND routine_schema = 'app';
-- Expected: 1 row showing app.current_user_id() returning text
*/

-- 3. Test function without context (should return NULL):
/*
SELECT app.current_user_id();
-- Expected: NULL
*/

-- 4. Test function with context:
/*
BEGIN;
SET LOCAL app.current_user_id = '01dbcb0e-6d5c-4612-baa0-376cb1a97783';
SELECT app.current_user_id();
-- Expected: '01dbcb0e-6d5c-4612-baa0-376cb1a97783'
ROLLBACK;
*/


-- ============================================
-- SECURITY NOTES
-- ============================================
--
-- DO NOT create a set_user_context() RPC function!
-- ------------------------------------------------
-- The application sets context directly via SET LOCAL in a transaction.
-- Exposing context-setting as an RPC would allow any authenticated user
-- to impersonate any other user by calling the RPC with a different ID.
--
-- How the application uses this:
-- ------------------------------------------------
-- 1. API route receives request with auth token
-- 2. Server validates token and extracts user ID
-- 3. Server opens transaction: BEGIN
-- 4. Server sets context: SET LOCAL app.current_user_id = '<validated-user-id>'
-- 5. Server runs queries (RLS policies filter automatically)
-- 6. Server commits: COMMIT
-- 7. Context is automatically cleared (SET LOCAL only lasts within transaction)
--
-- Why STABLE and not IMMUTABLE:
-- ------------------------------------------------
-- The function reads a session variable that can change between calls
-- (within different transactions). STABLE tells PostgreSQL the result
-- is consistent within a single statement, but may change between statements.
--
-- ============================================
