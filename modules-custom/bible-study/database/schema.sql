-- Bible Study Module - Database Schema
-- Tables: bible_study_kids, bible_study_personal, bible_study_word_studies, bible_study_chat_messages

-- Kids Bible Studies
CREATE TABLE IF NOT EXISTS bible_study_kids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  book TEXT NOT NULL,
  chapter INTEGER NOT NULL,
  verse_start INTEGER,
  verse_end INTEGER,
  key_lesson TEXT,
  discussion_questions JSONB DEFAULT '[]'::jsonb,
  memory_verse TEXT,
  notes_age_8 TEXT,
  notes_age_6 TEXT,
  notes_age_3 TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bible_study_kids_user_id ON bible_study_kids USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_bible_study_kids_user_created ON bible_study_kids USING btree (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bible_study_kids_book ON bible_study_kids USING btree (user_id, book);

ALTER TABLE bible_study_kids ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bible_study_kids_rls_select ON bible_study_kids;
CREATE POLICY bible_study_kids_rls_select ON bible_study_kids FOR SELECT TO public
  USING (user_id = (SELECT current_setting('app.current_user_id')));
DROP POLICY IF EXISTS bible_study_kids_rls_insert ON bible_study_kids;
CREATE POLICY bible_study_kids_rls_insert ON bible_study_kids FOR INSERT TO public
  WITH CHECK (user_id = (SELECT current_setting('app.current_user_id')));
DROP POLICY IF EXISTS bible_study_kids_rls_update ON bible_study_kids;
CREATE POLICY bible_study_kids_rls_update ON bible_study_kids FOR UPDATE TO public
  USING (user_id = (SELECT current_setting('app.current_user_id')));
DROP POLICY IF EXISTS bible_study_kids_rls_delete ON bible_study_kids;
CREATE POLICY bible_study_kids_rls_delete ON bible_study_kids FOR DELETE TO public
  USING (user_id = (SELECT current_setting('app.current_user_id')));

-- Personal Bible Studies
CREATE TABLE IF NOT EXISTS bible_study_personal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  book TEXT NOT NULL,
  chapter INTEGER NOT NULL,
  verse_start INTEGER,
  verse_end INTEGER,
  notes TEXT,
  tags JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bible_study_personal_user_id ON bible_study_personal USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_bible_study_personal_user_created ON bible_study_personal USING btree (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bible_study_personal_book ON bible_study_personal USING btree (user_id, book);

ALTER TABLE bible_study_personal ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bible_study_personal_rls_select ON bible_study_personal;
CREATE POLICY bible_study_personal_rls_select ON bible_study_personal FOR SELECT TO public
  USING (user_id = (SELECT current_setting('app.current_user_id')));
DROP POLICY IF EXISTS bible_study_personal_rls_insert ON bible_study_personal;
CREATE POLICY bible_study_personal_rls_insert ON bible_study_personal FOR INSERT TO public
  WITH CHECK (user_id = (SELECT current_setting('app.current_user_id')));
DROP POLICY IF EXISTS bible_study_personal_rls_update ON bible_study_personal;
CREATE POLICY bible_study_personal_rls_update ON bible_study_personal FOR UPDATE TO public
  USING (user_id = (SELECT current_setting('app.current_user_id')));
DROP POLICY IF EXISTS bible_study_personal_rls_delete ON bible_study_personal;
CREATE POLICY bible_study_personal_rls_delete ON bible_study_personal FOR DELETE TO public
  USING (user_id = (SELECT current_setting('app.current_user_id')));

-- Word Studies (Hebrew/Greek lookups linked to personal studies)
CREATE TABLE IF NOT EXISTS bible_study_word_studies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  study_id UUID NOT NULL REFERENCES bible_study_personal(id) ON DELETE CASCADE,
  original_word TEXT NOT NULL,
  transliteration TEXT,
  language TEXT NOT NULL CHECK (language IN ('hebrew', 'greek')),
  meaning TEXT NOT NULL,
  context_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bible_study_word_studies_user_id ON bible_study_word_studies USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_bible_study_word_studies_study_id ON bible_study_word_studies USING btree (study_id);

ALTER TABLE bible_study_word_studies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bible_study_word_studies_rls_select ON bible_study_word_studies;
CREATE POLICY bible_study_word_studies_rls_select ON bible_study_word_studies FOR SELECT TO public
  USING (user_id = (SELECT current_setting('app.current_user_id')));
DROP POLICY IF EXISTS bible_study_word_studies_rls_insert ON bible_study_word_studies;
CREATE POLICY bible_study_word_studies_rls_insert ON bible_study_word_studies FOR INSERT TO public
  WITH CHECK (user_id = (SELECT current_setting('app.current_user_id')));
DROP POLICY IF EXISTS bible_study_word_studies_rls_update ON bible_study_word_studies;
CREATE POLICY bible_study_word_studies_rls_update ON bible_study_word_studies FOR UPDATE TO public
  USING (user_id = (SELECT current_setting('app.current_user_id')));
DROP POLICY IF EXISTS bible_study_word_studies_rls_delete ON bible_study_word_studies;
CREATE POLICY bible_study_word_studies_rls_delete ON bible_study_word_studies FOR DELETE TO public
  USING (user_id = (SELECT current_setting('app.current_user_id')));

-- Chat Messages
CREATE TABLE IF NOT EXISTS bible_study_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  study_context JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bible_study_chat_messages_user_id ON bible_study_chat_messages USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_bible_study_chat_messages_user_created ON bible_study_chat_messages USING btree (user_id, created_at DESC);

ALTER TABLE bible_study_chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bible_study_chat_messages_rls_select ON bible_study_chat_messages;
CREATE POLICY bible_study_chat_messages_rls_select ON bible_study_chat_messages FOR SELECT TO public
  USING (user_id = (SELECT current_setting('app.current_user_id')));
DROP POLICY IF EXISTS bible_study_chat_messages_rls_insert ON bible_study_chat_messages;
CREATE POLICY bible_study_chat_messages_rls_insert ON bible_study_chat_messages FOR INSERT TO public
  WITH CHECK (user_id = (SELECT current_setting('app.current_user_id')));
DROP POLICY IF EXISTS bible_study_chat_messages_rls_update ON bible_study_chat_messages;
CREATE POLICY bible_study_chat_messages_rls_update ON bible_study_chat_messages FOR UPDATE TO public
  USING (user_id = (SELECT current_setting('app.current_user_id')));
DROP POLICY IF EXISTS bible_study_chat_messages_rls_delete ON bible_study_chat_messages;
CREATE POLICY bible_study_chat_messages_rls_delete ON bible_study_chat_messages FOR DELETE TO public
  USING (user_id = (SELECT current_setting('app.current_user_id')));
