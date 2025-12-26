-- ============================================
-- Migration 000: Drop Broken Foreign Key Constraints
-- ============================================
--
-- PURPOSE:
-- Remove FK constraints that point to the deprecated auth.users table.
-- After migrating from Supabase Auth to Better Auth, these FKs are broken
-- because auth.users is no longer used for authentication.
--
-- AFFECTED TABLES:
-- - knowledge_articles.user_id -> auth.users.id (BROKEN)
-- - knowledge_collections.user_id -> auth.users.id (BROKEN)
--
-- WHY RLS IS SUFFICIENT:
-- - RLS enforces "users can only access their own data" at database level
-- - Application code also filters by user_id (defense-in-depth)
-- - No security gap from removing these FKs
-- - With single user and no user deletion, cascading deletes aren't needed
--
-- ============================================


-- ============================================
-- STEP 1: PRE-FLIGHT VERIFICATION
-- ============================================
-- Run this query FIRST to see what FK constraints exist pointing to auth.users.
-- This helps verify the migration will drop the correct constraints.
--
-- Expected output:
--   constraint_name                      | table_name            | column_name | foreign_schema | foreign_table
--   knowledge_articles_user_id_fkey      | knowledge_articles    | user_id     | auth           | users
--   knowledge_collections_user_id_fkey   | knowledge_collections | user_id     | auth           | users
--
-- If you see different constraint names, update the DROP statements below accordingly.

/*
SELECT
  tc.constraint_name,
  tc.table_name,
  kcu.column_name,
  ccu.table_schema AS foreign_schema,
  ccu.table_name AS foreign_table
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND ccu.table_schema = 'auth'
  AND ccu.table_name = 'users';
*/


-- ============================================
-- STEP 2: DROP BROKEN FK CONSTRAINTS
-- ============================================
-- These constraints point to auth.users which is deprecated.
-- Using IF EXISTS makes this migration idempotent (safe to run multiple times).

-- Drop FK from knowledge_articles
ALTER TABLE knowledge_articles
  DROP CONSTRAINT IF EXISTS knowledge_articles_user_id_fkey;

-- Drop FK from knowledge_collections
ALTER TABLE knowledge_collections
  DROP CONSTRAINT IF EXISTS knowledge_collections_user_id_fkey;


-- ============================================
-- STEP 3: POST-MIGRATION VERIFICATION
-- ============================================
-- Run this query AFTER the migration to confirm no FKs remain pointing to auth.users.
-- Expected output: 0 rows

/*
SELECT
  tc.constraint_name,
  tc.table_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND ccu.table_schema = 'auth'
  AND ccu.table_name = 'users';
*/


-- ============================================
-- DESIGN DECISION: No FK Constraints on user_id
-- ============================================
-- We intentionally do NOT add FK constraints to the Better Auth user table.
--
-- Reasons:
-- 1. Type mismatch: Better Auth uses TEXT id, app tables use UUID
--    - Converting 27 tables from UUID to TEXT is significant work
--    - PostgreSQL cannot create FK between UUID and TEXT columns
--
-- 2. RLS provides the security we need
--    - Row Level Security enforces data isolation at database level
--    - Every table will have policies using app.current_user_id()
--
-- 3. Single-user application
--    - Cascading deletes on user deletion aren't required
--    - No risk of orphaned records in practice
--
-- 4. Simpler migration path
--    - Less invasive changes to existing schema
--    - Easier to verify and rollback if needed
--
-- FUTURE CONSIDERATION:
-- If multi-user support is added, consider:
-- - Converting user_id columns from UUID to TEXT, OR
-- - Using a junction/mapping table, OR
-- - Implementing soft deletes with application-level cleanup
-- ============================================
