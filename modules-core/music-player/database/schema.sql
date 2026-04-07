-- Music Player module schema
-- Idempotent: safe to run on every module enable.

CREATE TABLE IF NOT EXISTS music_playlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  youtube_video_id TEXT NOT NULL,
  title TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_music_playlist_user_id ON music_playlist(user_id);
CREATE INDEX IF NOT EXISTS idx_music_playlist_user_position ON music_playlist(user_id, position ASC);

ALTER TABLE music_playlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS music_playlist_rls_select ON music_playlist;
CREATE POLICY music_playlist_rls_select ON music_playlist FOR SELECT TO public
  USING (user_id::text = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS music_playlist_rls_insert ON music_playlist;
CREATE POLICY music_playlist_rls_insert ON music_playlist FOR INSERT TO public
  WITH CHECK (user_id::text = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS music_playlist_rls_update ON music_playlist;
CREATE POLICY music_playlist_rls_update ON music_playlist FOR UPDATE TO public
  USING (user_id::text = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS music_playlist_rls_delete ON music_playlist;
CREATE POLICY music_playlist_rls_delete ON music_playlist FOR DELETE TO public
  USING (user_id::text = (SELECT current_setting('app.current_user_id')));
