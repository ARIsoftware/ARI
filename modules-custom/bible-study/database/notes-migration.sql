-- Bible Study Notes Migration
-- Run this once in your Supabase SQL Editor.
-- Uses IF NOT EXISTS everywhere so it is safe to re-run.

-- ── Table ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bible_study_notes (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      TEXT        NOT NULL,
  bible_version TEXT       NOT NULL DEFAULT 'ESV',
  book         TEXT        NOT NULL,
  chapter      INTEGER     NOT NULL CHECK (chapter >= 1),
  verse_start  INTEGER     CHECK (verse_start >= 1),
  verse_end    INTEGER     CHECK (verse_end >= 1),
  title        TEXT,
  content      TEXT        NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_bible_study_notes_user_id
  ON bible_study_notes (user_id);

CREATE INDEX IF NOT EXISTS idx_bible_study_notes_user_passage
  ON bible_study_notes (user_id, book, chapter);

CREATE INDEX IF NOT EXISTS idx_bible_study_notes_user_created
  ON bible_study_notes (user_id, created_at DESC);

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE bible_study_notes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'bible_study_notes' AND policyname = 'bible_study_notes_rls_select'
  ) THEN
    CREATE POLICY bible_study_notes_rls_select ON bible_study_notes
      FOR SELECT TO public
      USING (user_id = (SELECT current_setting('app.current_user_id')));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'bible_study_notes' AND policyname = 'bible_study_notes_rls_insert'
  ) THEN
    CREATE POLICY bible_study_notes_rls_insert ON bible_study_notes
      FOR INSERT TO public
      WITH CHECK (user_id = (SELECT current_setting('app.current_user_id')));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'bible_study_notes' AND policyname = 'bible_study_notes_rls_update'
  ) THEN
    CREATE POLICY bible_study_notes_rls_update ON bible_study_notes
      FOR UPDATE TO public
      USING (user_id = (SELECT current_setting('app.current_user_id')));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'bible_study_notes' AND policyname = 'bible_study_notes_rls_delete'
  ) THEN
    CREATE POLICY bible_study_notes_rls_delete ON bible_study_notes
      FOR DELETE TO public
      USING (user_id = (SELECT current_setting('app.current_user_id')));
  END IF;
END $$;
