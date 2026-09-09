-- Today's Brief schema
-- Idempotent: safe to run on every module enable.
-- Mirrors modules-custom/todays-brief/database/schema.ts
--
-- Two tables:
--   todays_brief_google_tokens  — per-user Google OAuth tokens (encrypted at rest)
--   todays_brief_greetings      — the AI greeting/message, cached one row per day
--
-- User isolation is enforced at the application layer via withRLS(); the RLS
-- policies below are defense-in-depth and use current_setting('app.current_user_id')
-- (Better Auth does NOT use auth.uid()).

-- ─── Rename migration: morning_brief_* → todays_brief_* (2026-09) ───────────
-- The module was renamed from morning-brief to todays-brief. Installs that
-- predate the rename carry the old table names with live data (OAuth tokens,
-- iCal subscriptions, cached greetings) — rename in place so nothing is lost.
-- Each rename fires only while the old table exists and the new one doesn't,
-- so this stays idempotent and is a no-op on fresh installs. Indexes are
-- renamed alongside; old-named policies are dropped below (the CREATE POLICY
-- statements recreate them under the new names).
DO $$
BEGIN
  IF to_regclass('public.morning_brief_google_tokens') IS NOT NULL
     AND to_regclass('public.todays_brief_google_tokens') IS NULL THEN
    ALTER TABLE morning_brief_google_tokens RENAME TO todays_brief_google_tokens;
    ALTER INDEX IF EXISTS idx_morning_brief_google_tokens_user_id
      RENAME TO idx_todays_brief_google_tokens_user_id;
  END IF;
  IF to_regclass('public.morning_brief_ical_subscriptions') IS NOT NULL
     AND to_regclass('public.todays_brief_ical_subscriptions') IS NULL THEN
    ALTER TABLE morning_brief_ical_subscriptions RENAME TO todays_brief_ical_subscriptions;
    ALTER INDEX IF EXISTS idx_morning_brief_ical_subscriptions_user_id
      RENAME TO idx_todays_brief_ical_subscriptions_user_id;
  END IF;
  IF to_regclass('public.morning_brief_greetings') IS NOT NULL
     AND to_regclass('public.todays_brief_greetings') IS NULL THEN
    ALTER TABLE morning_brief_greetings RENAME TO todays_brief_greetings;
    ALTER INDEX IF EXISTS idx_morning_brief_greetings_user_date
      RENAME TO idx_todays_brief_greetings_user_date;
  END IF;
END $$;

-- ─── Google OAuth tokens ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS todays_brief_google_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  -- access_token + refresh_token are stored encrypted (lib/crypto encrypt()).
  access_token TEXT,
  refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ,
  google_email TEXT,
  scope TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One Google connection per user (drives the upsert in the callback route).
CREATE UNIQUE INDEX IF NOT EXISTS idx_todays_brief_google_tokens_user_id
  ON todays_brief_google_tokens(user_id);

ALTER TABLE todays_brief_google_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS morning_brief_google_tokens_rls_select ON todays_brief_google_tokens;
DROP POLICY IF EXISTS todays_brief_google_tokens_rls_select ON todays_brief_google_tokens;
CREATE POLICY todays_brief_google_tokens_rls_select ON todays_brief_google_tokens FOR SELECT
  USING (user_id = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS morning_brief_google_tokens_rls_insert ON todays_brief_google_tokens;
DROP POLICY IF EXISTS todays_brief_google_tokens_rls_insert ON todays_brief_google_tokens;
CREATE POLICY todays_brief_google_tokens_rls_insert ON todays_brief_google_tokens FOR INSERT
  WITH CHECK (user_id = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS morning_brief_google_tokens_rls_update ON todays_brief_google_tokens;
DROP POLICY IF EXISTS todays_brief_google_tokens_rls_update ON todays_brief_google_tokens;
CREATE POLICY todays_brief_google_tokens_rls_update ON todays_brief_google_tokens FOR UPDATE
  USING (user_id = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS morning_brief_google_tokens_rls_delete ON todays_brief_google_tokens;
DROP POLICY IF EXISTS todays_brief_google_tokens_rls_delete ON todays_brief_google_tokens;
CREATE POLICY todays_brief_google_tokens_rls_delete ON todays_brief_google_tokens FOR DELETE
  USING (user_id = (SELECT current_setting('app.current_user_id')));

-- ─── iCal subscription (alternative to OAuth) ───────────────────────────────
-- A single subscribed .ics feed URL per user (e.g. Google's "secret address in
-- iCal format"), stored encrypted. When present, the calendar route reads this
-- feed instead of the Google OAuth API.
CREATE TABLE IF NOT EXISTS todays_brief_ical_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  -- ics_url is stored encrypted (lib/crypto encrypt()).
  ics_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One subscription per user (drives the upsert in the subscribe route).
CREATE UNIQUE INDEX IF NOT EXISTS idx_todays_brief_ical_subscriptions_user_id
  ON todays_brief_ical_subscriptions(user_id);

ALTER TABLE todays_brief_ical_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS morning_brief_ical_subscriptions_rls_select ON todays_brief_ical_subscriptions;
DROP POLICY IF EXISTS todays_brief_ical_subscriptions_rls_select ON todays_brief_ical_subscriptions;
CREATE POLICY todays_brief_ical_subscriptions_rls_select ON todays_brief_ical_subscriptions FOR SELECT
  USING (user_id = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS morning_brief_ical_subscriptions_rls_insert ON todays_brief_ical_subscriptions;
DROP POLICY IF EXISTS todays_brief_ical_subscriptions_rls_insert ON todays_brief_ical_subscriptions;
CREATE POLICY todays_brief_ical_subscriptions_rls_insert ON todays_brief_ical_subscriptions FOR INSERT
  WITH CHECK (user_id = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS morning_brief_ical_subscriptions_rls_update ON todays_brief_ical_subscriptions;
DROP POLICY IF EXISTS todays_brief_ical_subscriptions_rls_update ON todays_brief_ical_subscriptions;
CREATE POLICY todays_brief_ical_subscriptions_rls_update ON todays_brief_ical_subscriptions FOR UPDATE
  USING (user_id = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS morning_brief_ical_subscriptions_rls_delete ON todays_brief_ical_subscriptions;
DROP POLICY IF EXISTS todays_brief_ical_subscriptions_rls_delete ON todays_brief_ical_subscriptions;
CREATE POLICY todays_brief_ical_subscriptions_rls_delete ON todays_brief_ical_subscriptions FOR DELETE
  USING (user_id = (SELECT current_setting('app.current_user_id')));

-- ─── Daily greeting cache ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS todays_brief_greetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  -- The brief's calendar day, computed in the user's timezone. Expires naturally:
  -- a new day has a new brief_date, so a fresh greeting is generated after midnight.
  brief_date DATE NOT NULL,
  greeting TEXT NOT NULL,
  message TEXT NOT NULL,
  provider TEXT,
  model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One greeting per user per day (drives the upsert in the greeting route).
CREATE UNIQUE INDEX IF NOT EXISTS idx_todays_brief_greetings_user_date
  ON todays_brief_greetings(user_id, brief_date);

ALTER TABLE todays_brief_greetings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS morning_brief_greetings_rls_select ON todays_brief_greetings;
DROP POLICY IF EXISTS todays_brief_greetings_rls_select ON todays_brief_greetings;
CREATE POLICY todays_brief_greetings_rls_select ON todays_brief_greetings FOR SELECT
  USING (user_id = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS morning_brief_greetings_rls_insert ON todays_brief_greetings;
DROP POLICY IF EXISTS todays_brief_greetings_rls_insert ON todays_brief_greetings;
CREATE POLICY todays_brief_greetings_rls_insert ON todays_brief_greetings FOR INSERT
  WITH CHECK (user_id = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS morning_brief_greetings_rls_update ON todays_brief_greetings;
DROP POLICY IF EXISTS todays_brief_greetings_rls_update ON todays_brief_greetings;
CREATE POLICY todays_brief_greetings_rls_update ON todays_brief_greetings FOR UPDATE
  USING (user_id = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS morning_brief_greetings_rls_delete ON todays_brief_greetings;
DROP POLICY IF EXISTS todays_brief_greetings_rls_delete ON todays_brief_greetings;
CREATE POLICY todays_brief_greetings_rls_delete ON todays_brief_greetings FOR DELETE
  USING (user_id = (SELECT current_setting('app.current_user_id')));
