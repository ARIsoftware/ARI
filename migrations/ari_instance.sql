-- ================================================================
-- ARI Instance Table
-- ================================================================
-- Single-row table holding a per-install identity used for anonymous
-- telemetry (POST /tv/connect) and an opt-out toggle.
--
-- - id: opaque UUID v4, generated once per install, never changes
-- - telemetry_enabled: install-wide opt-out (default: enabled)
--
-- Run this once against your existing database. New installs get the
-- same DDL via lib/db/setup.sql.
-- ================================================================

CREATE TABLE IF NOT EXISTS "ari_instance" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "telemetry_enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("id")
);

-- Seed exactly one row if none exists.
INSERT INTO "ari_instance" ("telemetry_enabled")
SELECT TRUE
WHERE NOT EXISTS (SELECT 1 FROM "ari_instance");

-- Enable RLS. ari_instance is install-scoped (not user-scoped), so any
-- authenticated user may read/update the single row. Server-side code
-- using the service role bypasses these policies anyway.
ALTER TABLE "ari_instance" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ari_instance_rls_select" ON "ari_instance";
CREATE POLICY "ari_instance_rls_select" ON "ari_instance" FOR SELECT TO public
  USING (TRUE);

DROP POLICY IF EXISTS "ari_instance_rls_update" ON "ari_instance";
CREATE POLICY "ari_instance_rls_update" ON "ari_instance" FOR UPDATE TO public
  USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS "ari_instance_rls_insert" ON "ari_instance";
CREATE POLICY "ari_instance_rls_insert" ON "ari_instance" FOR INSERT TO public
  WITH CHECK (TRUE);
