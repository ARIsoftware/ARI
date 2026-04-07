-- ================================================================
-- ARI Database Setup
-- Creates all required tables with Row Level Security (RLS)
-- Run this in the Supabase SQL Editor before first use
-- NOTE: Keep in sync with lib/db/setup-sql.ts (TS export for /welcome)
-- ================================================================

BEGIN;

SET session_replication_role = 'replica';

-- ================================================================
-- APP FUNCTION (used by RLS policies)
-- ================================================================

CREATE SCHEMA IF NOT EXISTS app;
CREATE OR REPLACE FUNCTION app.current_user_id()
RETURNS TEXT AS $$
  SELECT current_setting('app.current_user_id', true);
$$ LANGUAGE sql STABLE;

-- ================================================================
-- AUTH TABLES (user must come first - referenced by others)
-- ================================================================

-- Table: user
DROP TABLE IF EXISTS "user" CASCADE;
CREATE TABLE "user" (
  "id" TEXT NOT NULL,
  "name" TEXT,
  "email" TEXT NOT NULL,
  "emailVerified" BOOLEAN DEFAULT FALSE,
  "image" TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
  "firstName" TEXT,
  "lastName" TEXT,
  "twoFactorEnabled" BOOLEAN DEFAULT FALSE,
  PRIMARY KEY ("id"),
  CONSTRAINT "user_email_key" UNIQUE ("email")
);
ALTER TABLE "user" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_rls_all" ON "user" FOR ALL TO public USING (true) WITH CHECK (true);

-- Table: session
DROP TABLE IF EXISTS "session" CASCADE;
CREATE TABLE "session" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY ("id"),
  CONSTRAINT "session_token_key" UNIQUE ("token")
);
ALTER TABLE "session" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "session_rls_all" ON "session" FOR ALL TO public USING (true) WITH CHECK (true);

-- Table: account
DROP TABLE IF EXISTS "account" CASCADE;
CREATE TABLE "account" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "accessTokenExpiresAt" TIMESTAMPTZ,
  "refreshTokenExpiresAt" TIMESTAMPTZ,
  "scope" TEXT,
  "idToken" TEXT,
  "password" TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY ("id")
);
ALTER TABLE "account" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "account_rls_all" ON "account" FOR ALL TO public USING (true) WITH CHECK (true);

-- Table: twoFactor
DROP TABLE IF EXISTS "twoFactor" CASCADE;
CREATE TABLE "twoFactor" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "secret" TEXT NOT NULL,
  "backupCodes" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  PRIMARY KEY ("id")
);
ALTER TABLE "twoFactor" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "twoFactor_rls_all" ON "twoFactor" FOR ALL TO public USING (true) WITH CHECK (true);

-- Table: verification
DROP TABLE IF EXISTS "verification" CASCADE;
CREATE TABLE "verification" (
  "id" TEXT NOT NULL,
  "identifier" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY ("id")
);
ALTER TABLE "verification" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "verification_rls_all" ON "verification" FOR ALL TO public USING (true) WITH CHECK (true);

-- ================================================================
-- SYSTEM TABLES
-- ================================================================

-- Table: user_preferences
DROP TABLE IF EXISTS "user_preferences" CASCADE;
CREATE TABLE "user_preferences" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" TEXT NOT NULL,
  "name" VARCHAR(255),
  "email" VARCHAR(255),
  "title" VARCHAR(255),
  "company_name" VARCHAR(255),
  "country" VARCHAR(100),
  "city" VARCHAR(100),
  "linkedin_url" VARCHAR(500),
  "timezone" VARCHAR(50),
  "created_at" TIMESTAMPTZ DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY ("id"),
  CONSTRAINT "user_preferences_user_id_key" UNIQUE ("user_id")
);

-- Table: module_settings
DROP TABLE IF EXISTS "module_settings" CASCADE;
CREATE TABLE "module_settings" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" TEXT NOT NULL,
  "module_id" VARCHAR(255) NOT NULL,
  "enabled" BOOLEAN DEFAULT TRUE,
  "settings" JSONB,
  "created_at" TIMESTAMPTZ DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY ("id"),
  CONSTRAINT "module_settings_user_id_module_id_key" UNIQUE ("user_id", "module_id")
);
ALTER TABLE "module_settings" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "module_settings_rls_select" ON "module_settings" FOR SELECT TO public
  USING (user_id::text = (SELECT current_setting('app.current_user_id')));
CREATE POLICY "module_settings_rls_insert" ON "module_settings" FOR INSERT TO public
  WITH CHECK (user_id::text = (SELECT current_setting('app.current_user_id')));
CREATE POLICY "module_settings_rls_update" ON "module_settings" FOR UPDATE TO public
  USING (user_id::text = (SELECT current_setting('app.current_user_id')));
CREATE POLICY "module_settings_rls_delete" ON "module_settings" FOR DELETE TO public
  USING (user_id::text = (SELECT current_setting('app.current_user_id')));

-- Table: module_migrations
DROP TABLE IF EXISTS "module_migrations" CASCADE;
CREATE TABLE "module_migrations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "module_id" VARCHAR(255) NOT NULL,
  "migration_name" VARCHAR(255) NOT NULL,
  "applied_at" TIMESTAMPTZ DEFAULT NOW(),
  "applied_by" TEXT,
  PRIMARY KEY ("id"),
  CONSTRAINT "module_migrations_module_id_migration_name_key" UNIQUE ("module_id", "migration_name")
);
ALTER TABLE "module_migrations" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "module_migrations_rls_all" ON "module_migrations" FOR ALL TO public USING (true) WITH CHECK (true);

-- ================================================================
-- MODULE TABLES
-- ================================================================

-- Table: tasks
DROP TABLE IF EXISTS "tasks" CASCADE;
CREATE TABLE "tasks" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "title" TEXT NOT NULL,
  "assignees" TEXT[],
  "due_date" DATE,
  "subtasks_completed" INTEGER DEFAULT 0,
  "subtasks_total" INTEGER DEFAULT 0,
  "status" TEXT,
  "priority" TEXT,
  "pinned" BOOLEAN DEFAULT FALSE,
  "completed" BOOLEAN DEFAULT FALSE,
  "created_at" TIMESTAMPTZ DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ DEFAULT NOW(),
  "order_index" INTEGER DEFAULT 0,
  "completion_count" INTEGER DEFAULT 0,
  "user_email" TEXT,
  "user_id" TEXT NOT NULL,
  "impact" INTEGER DEFAULT 3,
  "severity" INTEGER DEFAULT 3,
  "timeliness" INTEGER DEFAULT 3,
  "effort" INTEGER DEFAULT 3,
  "strategic_fit" INTEGER DEFAULT 3,
  "priority_score" NUMERIC DEFAULT 0,
  "project_id" UUID,
  "monster_type" TEXT,
  "monster_colors" JSONB,
  PRIMARY KEY ("id")
);
ALTER TABLE "tasks" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tasks_rls_select" ON "tasks" FOR SELECT TO public
  USING (user_id::text = (SELECT current_setting('app.current_user_id')));
CREATE POLICY "tasks_rls_insert" ON "tasks" FOR INSERT TO public
  WITH CHECK (user_id::text = (SELECT current_setting('app.current_user_id')));
CREATE POLICY "tasks_rls_update" ON "tasks" FOR UPDATE TO public
  USING (user_id::text = (SELECT current_setting('app.current_user_id')));
CREATE POLICY "tasks_rls_delete" ON "tasks" FOR DELETE TO public
  USING (user_id::text = (SELECT current_setting('app.current_user_id')));

-- Table: quotes
DROP TABLE IF EXISTS "quotes" CASCADE;
CREATE TABLE "quotes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" TEXT NOT NULL,
  "quote" TEXT NOT NULL,
  "author" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("id")
);
ALTER TABLE "quotes" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "quotes_rls_select" ON "quotes" FOR SELECT TO public
  USING (user_id::text = (SELECT current_setting('app.current_user_id')));
CREATE POLICY "quotes_rls_insert" ON "quotes" FOR INSERT TO public
  WITH CHECK (user_id::text = (SELECT current_setting('app.current_user_id')));
CREATE POLICY "quotes_rls_update" ON "quotes" FOR UPDATE TO public
  USING (user_id::text = (SELECT current_setting('app.current_user_id')));
CREATE POLICY "quotes_rls_delete" ON "quotes" FOR DELETE TO public
  USING (user_id::text = (SELECT current_setting('app.current_user_id')));

-- Table: music_playlist
DROP TABLE IF EXISTS "music_playlist" CASCADE;
CREATE TABLE "music_playlist" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" TEXT NOT NULL,
  "youtube_video_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("id")
);
ALTER TABLE "music_playlist" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "music_playlist_rls_select" ON "music_playlist" FOR SELECT TO public
  USING (user_id = (SELECT current_setting('app.current_user_id')));
CREATE POLICY "music_playlist_rls_insert" ON "music_playlist" FOR INSERT TO public
  WITH CHECK (user_id = (SELECT current_setting('app.current_user_id')));
CREATE POLICY "music_playlist_rls_update" ON "music_playlist" FOR UPDATE TO public
  USING (user_id = (SELECT current_setting('app.current_user_id')));
CREATE POLICY "music_playlist_rls_delete" ON "music_playlist" FOR DELETE TO public
  USING (user_id = (SELECT current_setting('app.current_user_id')));

-- Table: notepad
DROP TABLE IF EXISTS "notepad" CASCADE;
CREATE TABLE "notepad" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("id"),
  CONSTRAINT "notepad_user_id_key" UNIQUE ("user_id")
);
ALTER TABLE "notepad" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notepad_rls_select" ON "notepad" FOR SELECT TO public
  USING (user_id::text = (SELECT current_setting('app.current_user_id')));
CREATE POLICY "notepad_rls_insert" ON "notepad" FOR INSERT TO public
  WITH CHECK (user_id::text = (SELECT current_setting('app.current_user_id')));
CREATE POLICY "notepad_rls_update" ON "notepad" FOR UPDATE TO public
  USING (user_id::text = (SELECT current_setting('app.current_user_id')));
CREATE POLICY "notepad_rls_delete" ON "notepad" FOR DELETE TO public
  USING (user_id::text = (SELECT current_setting('app.current_user_id')));

-- Table: notepad_revisions
DROP TABLE IF EXISTS "notepad_revisions" CASCADE;
CREATE TABLE "notepad_revisions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "revision_number" INTEGER NOT NULL,
  PRIMARY KEY ("id")
);
ALTER TABLE "notepad_revisions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notepad_revisions_rls_select" ON "notepad_revisions" FOR SELECT TO public
  USING (user_id::text = (SELECT current_setting('app.current_user_id')));
CREATE POLICY "notepad_revisions_rls_insert" ON "notepad_revisions" FOR INSERT TO public
  WITH CHECK (user_id::text = (SELECT current_setting('app.current_user_id')));
CREATE POLICY "notepad_revisions_rls_update" ON "notepad_revisions" FOR UPDATE TO public
  USING (user_id::text = (SELECT current_setting('app.current_user_id')));
CREATE POLICY "notepad_revisions_rls_delete" ON "notepad_revisions" FOR DELETE TO public
  USING (user_id::text = (SELECT current_setting('app.current_user_id')));

-- ================================================================
-- ARI INSTANCE (per-install identity for anonymous telemetry)
-- ================================================================

CREATE TABLE IF NOT EXISTS "ari_instance" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "telemetry_enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("id")
);

INSERT INTO "ari_instance" ("telemetry_enabled")
SELECT TRUE
WHERE NOT EXISTS (SELECT 1 FROM "ari_instance");

ALTER TABLE "ari_instance" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ari_instance_rls_select" ON "ari_instance" FOR SELECT TO public
  USING (TRUE);
CREATE POLICY "ari_instance_rls_update" ON "ari_instance" FOR UPDATE TO public
  USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "ari_instance_rls_insert" ON "ari_instance" FOR INSERT TO public
  WITH CHECK (TRUE);

-- ================================================================
-- INDEXES
-- ================================================================

CREATE INDEX IF NOT EXISTS idx_user_email ON "user"("email");
CREATE INDEX IF NOT EXISTS idx_session_token ON "session"("token");
CREATE INDEX IF NOT EXISTS idx_session_user_id ON "session"("userId");
CREATE INDEX IF NOT EXISTS idx_account_user_id ON "account"("userId");
CREATE INDEX IF NOT EXISTS idx_twoFactor_user_id ON "twoFactor"("userId");
CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON "user_preferences"("user_id");
CREATE INDEX IF NOT EXISTS idx_module_settings_user_id ON "module_settings"("user_id");
CREATE INDEX IF NOT EXISTS idx_module_settings_module_id ON "module_settings"("module_id");
CREATE INDEX IF NOT EXISTS idx_module_migrations_module_id ON "module_migrations"("module_id");
CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON "tasks"("user_id");
CREATE INDEX IF NOT EXISTS idx_tasks_user_id_completed ON "tasks"("user_id", "completed");
CREATE INDEX IF NOT EXISTS idx_tasks_completed ON "tasks"("completed");
CREATE INDEX IF NOT EXISTS idx_tasks_order_index ON "tasks"("order_index");
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON "tasks"("created_at");
CREATE INDEX IF NOT EXISTS idx_quotes_user_id ON "quotes"("user_id");
CREATE INDEX IF NOT EXISTS idx_music_playlist_user_id ON "music_playlist"("user_id");
CREATE INDEX IF NOT EXISTS idx_music_playlist_user_position ON "music_playlist"("user_id", "position" ASC);
CREATE INDEX IF NOT EXISTS idx_notepad_user_id ON "notepad"("user_id");
CREATE INDEX IF NOT EXISTS idx_notepad_revisions_user_id ON "notepad_revisions"("user_id");

SET session_replication_role = 'origin';

COMMIT;
