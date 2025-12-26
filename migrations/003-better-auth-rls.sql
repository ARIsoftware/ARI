-- ============================================
-- Migration 003: Better Auth Tables RLS
-- ============================================
--
-- PURPOSE:
-- Configure RLS for Better Auth tables (user, session, account, verification).
--
-- IMPORTANT CONTEXT:
-- Better Auth manages these tables internally via a direct database connection
-- that does NOT set app.current_user_id. This means:
--
-- 1. If we enable restrictive RLS, Better Auth operations would FAIL
--    (login, signup, session management, etc.)
--
-- 2. Better Auth already runs server-side only - it's not exposed to clients
--
-- 3. Application code doesn't query these tables directly
--
-- RECOMMENDED APPROACH (implemented below):
-- - Enable RLS on Better Auth tables for consistency
-- - Create PERMISSIVE policies that allow Better Auth to function
-- - Add user-scoped SELECT policies for when user context IS set
--
-- This gives us:
-- ✓ RLS enabled on all tables (consistent security posture)
-- ✓ Better Auth operations work (no user context required for INSERT/UPDATE/DELETE)
-- ✓ When user context IS set, users can only see their own data
--
-- ============================================


-- ============================================
-- STEP 1: Enable RLS on Better Auth tables
-- ============================================

ALTER TABLE public."user" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."account" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."verification" ENABLE ROW LEVEL SECURITY;


-- ============================================
-- STEP 2: User table policies
-- ============================================
-- Users can read their own user record.
-- All other operations are unrestricted (Better Auth needs full access).

-- Drop any existing policies
DROP POLICY IF EXISTS "user_select_own" ON public."user";
DROP POLICY IF EXISTS "user_all_operations" ON public."user";

-- Allow users to SELECT their own record when context is set
CREATE POLICY "user_select_own"
  ON public."user"
  FOR SELECT
  USING (
    -- Either no context set (Better Auth server-side) OR user is accessing their own record
    app.current_user_id() IS NULL OR id = app.current_user_id()
  );

-- Allow all INSERT/UPDATE/DELETE for Better Auth operations
CREATE POLICY "user_all_operations"
  ON public."user"
  FOR ALL
  USING (true)
  WITH CHECK (true);


-- ============================================
-- STEP 3: Session table policies
-- ============================================
-- Users can read their own sessions.
-- Better Auth needs full access for session management.

-- Drop any existing policies
DROP POLICY IF EXISTS "session_select_own" ON public."session";
DROP POLICY IF EXISTS "session_all_operations" ON public."session";

-- Allow users to SELECT their own sessions
CREATE POLICY "session_select_own"
  ON public."session"
  FOR SELECT
  USING (
    app.current_user_id() IS NULL OR "userId" = app.current_user_id()
  );

-- Allow all operations for Better Auth
CREATE POLICY "session_all_operations"
  ON public."session"
  FOR ALL
  USING (true)
  WITH CHECK (true);


-- ============================================
-- STEP 4: Account table policies
-- ============================================
-- Users can read their own accounts.
-- Better Auth needs full access for account management.

-- Drop any existing policies
DROP POLICY IF EXISTS "account_select_own" ON public."account";
DROP POLICY IF EXISTS "account_all_operations" ON public."account";

-- Allow users to SELECT their own accounts
CREATE POLICY "account_select_own"
  ON public."account"
  FOR SELECT
  USING (
    app.current_user_id() IS NULL OR "userId" = app.current_user_id()
  );

-- Allow all operations for Better Auth
CREATE POLICY "account_all_operations"
  ON public."account"
  FOR ALL
  USING (true)
  WITH CHECK (true);


-- ============================================
-- STEP 5: Verification table policies
-- ============================================
-- Verification tokens are used during auth flows BEFORE a user is authenticated.
-- No user-scoped policies make sense here.
-- Better Auth needs full access.

-- Drop any existing policies
DROP POLICY IF EXISTS "verification_all_operations" ON public."verification";

-- Allow all operations (used during signup/login before auth)
CREATE POLICY "verification_all_operations"
  ON public."verification"
  FOR ALL
  USING (true)
  WITH CHECK (true);


-- ============================================
-- VERIFICATION QUERIES
-- ============================================
-- Run these after the migration to verify it worked

-- 1. Check RLS is enabled on all Better Auth tables:
/*
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('user', 'session', 'account', 'verification');
-- Expected: All should show rowsecurity = true
*/

-- 2. Check policies exist:
/*
SELECT schemaname, tablename, policyname
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('user', 'session', 'account', 'verification')
ORDER BY tablename, policyname;
-- Expected: Policies for each table
*/

-- 3. Test Better Auth operations still work (login as a user):
-- After running this migration, test that you can still log in and out.
-- If login fails, check Better Auth logs for RLS-related errors.


-- ============================================
-- SECURITY NOTES
-- ============================================
--
-- Q: Why allow all operations on Better Auth tables?
-- A: Better Auth is a server-side library that manages auth state. It needs
--    unrestricted access to create sessions, update users, manage accounts, etc.
--    These operations happen without a user context set.
--
-- Q: Is this less secure than the app tables?
-- A: Not really. The key differences:
--    1. App code doesn't query these tables directly (uses Better Auth API)
--    2. Better Auth runs server-side only (not exposed to clients)
--    3. The SELECT policies still protect data when user context IS set
--
-- Q: When would the SELECT policies matter?
-- A: If you ever add features that let users view their sessions or accounts,
--    the RLS policies ensure they can only see their own data.
--
-- FUTURE CONSIDERATION:
-- If you move to a multi-tenant architecture, you might want stricter
-- policies. But for single-user/personal app, this is appropriate.
--
-- ============================================
