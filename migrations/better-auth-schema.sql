-- Better Auth Schema for PostgreSQL
-- Run this in Supabase SQL Editor to create the auth tables

-- ============================================
-- User Table
-- ============================================
CREATE TABLE IF NOT EXISTS public."user" (
  id TEXT PRIMARY KEY,
  name TEXT,
  email TEXT UNIQUE NOT NULL,
  "emailVerified" BOOLEAN DEFAULT FALSE,
  image TEXT,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  -- Custom fields from additionalFields in auth.ts
  "firstName" TEXT,
  "lastName" TEXT
);

-- ============================================
-- Session Table
-- ============================================
CREATE TABLE IF NOT EXISTS public."session" (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- Account Table
-- ============================================
CREATE TABLE IF NOT EXISTS public."account" (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  "accountId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "accessTokenExpiresAt" TIMESTAMP WITH TIME ZONE,
  "refreshTokenExpiresAt" TIMESTAMP WITH TIME ZONE,
  scope TEXT,
  "idToken" TEXT,
  password TEXT,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- Verification Table
-- ============================================
CREATE TABLE IF NOT EXISTS public."verification" (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- Indexes for performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_session_user_id ON public."session"("userId");
CREATE INDEX IF NOT EXISTS idx_session_token ON public."session"(token);
CREATE INDEX IF NOT EXISTS idx_account_user_id ON public."account"("userId");
CREATE INDEX IF NOT EXISTS idx_user_email ON public."user"(email);

-- ============================================
-- Verify tables were created
-- ============================================
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('user', 'session', 'account', 'verification');
