-- Better Auth User Migration
-- Run this AFTER running: npx @better-auth/cli migrate
-- This migrates the existing Supabase user to Better Auth tables

-- ============================================
-- STEP 1: Verify source user exists
-- ============================================
SELECT id, email, encrypted_password, raw_user_meta_data, created_at
FROM auth.users
WHERE email = 'noam@morpheus.network';

-- ============================================
-- STEP 2: Migrate user to Better Auth user table
-- ============================================
-- IMPORTANT: Preserving exact UUID to maintain FK relationships with 27 tables
--
-- Better Auth Default Columns: id, name, email, emailVerified, image, createdAt, updatedAt
-- Custom additionalFields: firstName, lastName (created by CLI migrate)

INSERT INTO public."user" (
  id,
  name,
  email,
  "emailVerified",
  image,
  "createdAt",
  "updatedAt",
  "firstName",
  "lastName"
)
SELECT
  id::text,  -- Preserve exact UUID to maintain FK relationships
  COALESCE(
    raw_user_meta_data->>'full_name',
    CONCAT(raw_user_meta_data->>'first_name', ' ', raw_user_meta_data->>'last_name'),
    email
  ),
  email,
  CASE WHEN email_confirmed_at IS NOT NULL THEN true ELSE false END,
  raw_user_meta_data->>'avatar_url',
  created_at,
  updated_at,
  raw_user_meta_data->>'first_name',
  raw_user_meta_data->>'last_name'
FROM auth.users
WHERE email = 'noam@morpheus.network'
ON CONFLICT (id) DO NOTHING;  -- Safety: don't duplicate if run twice

-- ============================================
-- STEP 3: Migrate password credential to account table
-- ============================================
-- The bcrypt hash will be verified by our custom verify function in /lib/auth.ts

INSERT INTO public.account (
  id,
  "userId",
  "accountId",
  "providerId",
  password,
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  id::text,
  id::text,
  'credential',
  encrypted_password,  -- bcrypt hash from Supabase
  created_at,
  updated_at
FROM auth.users
WHERE email = 'noam@morpheus.network'
ON CONFLICT DO NOTHING;

-- ============================================
-- STEP 4: Verify migration was successful
-- ============================================
SELECT
  u.id,
  u.email,
  u.name,
  u."firstName",
  u."lastName",
  a."providerId",
  LENGTH(a.password) as hash_length
FROM public."user" u
JOIN public.account a ON u.id = a."userId"
WHERE u.email = 'noam@morpheus.network';
