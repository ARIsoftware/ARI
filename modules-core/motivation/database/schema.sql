-- Motivation module schema
-- Idempotent: safe to run on every module enable.
-- Mirrors modules-custom/motivation/database/schema.ts

CREATE TABLE IF NOT EXISTS motivation_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  youtube_id TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT,
  channel TEXT,
  thumbnail_url TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_motivation_videos_user_youtube
  ON motivation_videos(user_id, youtube_id);

CREATE INDEX IF NOT EXISTS idx_motivation_videos_user_position
  ON motivation_videos(user_id, position ASC);

CREATE INDEX IF NOT EXISTS idx_motivation_videos_user_created
  ON motivation_videos(user_id, created_at DESC);

-- Migration: idx_motivation_videos_user_id was redundant — every read filter
-- on user_id is already served by either the (user_id, youtube_id) unique
-- index or one of the (user_id, ...) composites above. Removing reduces
-- write amplification on insert/update.
DROP INDEX IF EXISTS idx_motivation_videos_user_id;

ALTER TABLE motivation_videos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS motivation_videos_rls_select ON motivation_videos;
CREATE POLICY motivation_videos_rls_select ON motivation_videos FOR SELECT
  USING (user_id = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS motivation_videos_rls_insert ON motivation_videos;
CREATE POLICY motivation_videos_rls_insert ON motivation_videos FOR INSERT
  WITH CHECK (user_id = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS motivation_videos_rls_update ON motivation_videos;
CREATE POLICY motivation_videos_rls_update ON motivation_videos FOR UPDATE
  USING      (user_id = (SELECT current_setting('app.current_user_id')))
  WITH CHECK (user_id = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS motivation_videos_rls_delete ON motivation_videos;
CREATE POLICY motivation_videos_rls_delete ON motivation_videos FOR DELETE
  USING (user_id = (SELECT current_setting('app.current_user_id')));
