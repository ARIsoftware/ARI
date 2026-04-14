-- Bible Study Module - Conversations Migration
-- Adds proper conversation threading with bible_study_conversations + bible_study_messages
-- Safe to run multiple times (uses IF NOT EXISTS / DO blocks)

CREATE TABLE IF NOT EXISTS bible_study_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT 'New Conversation',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bible_study_convs_user_id
  ON bible_study_conversations USING btree (user_id);

CREATE INDEX IF NOT EXISTS idx_bible_study_convs_user_updated
  ON bible_study_conversations USING btree (user_id, updated_at DESC);

ALTER TABLE bible_study_conversations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bible_study_conversations' AND policyname = 'bible_study_convs_rls_select') THEN
    CREATE POLICY bible_study_convs_rls_select ON bible_study_conversations FOR SELECT TO public
      USING (user_id = (SELECT current_setting('app.current_user_id')));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bible_study_conversations' AND policyname = 'bible_study_convs_rls_insert') THEN
    CREATE POLICY bible_study_convs_rls_insert ON bible_study_conversations FOR INSERT TO public
      WITH CHECK (user_id = (SELECT current_setting('app.current_user_id')));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bible_study_conversations' AND policyname = 'bible_study_convs_rls_update') THEN
    CREATE POLICY bible_study_convs_rls_update ON bible_study_conversations FOR UPDATE TO public
      USING (user_id = (SELECT current_setting('app.current_user_id')));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bible_study_conversations' AND policyname = 'bible_study_convs_rls_delete') THEN
    CREATE POLICY bible_study_convs_rls_delete ON bible_study_conversations FOR DELETE TO public
      USING (user_id = (SELECT current_setting('app.current_user_id')));
  END IF;
END $$;

-- Messages table (replaces the flat bible_study_chat_messages for the new chat UI)
CREATE TABLE IF NOT EXISTS bible_study_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  conversation_id UUID NOT NULL REFERENCES bible_study_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bible_study_msgs_conversation_id
  ON bible_study_messages USING btree (conversation_id);

CREATE INDEX IF NOT EXISTS idx_bible_study_msgs_user_id
  ON bible_study_messages USING btree (user_id);

ALTER TABLE bible_study_messages ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bible_study_messages' AND policyname = 'bible_study_msgs_rls_select') THEN
    CREATE POLICY bible_study_msgs_rls_select ON bible_study_messages FOR SELECT TO public
      USING (user_id = (SELECT current_setting('app.current_user_id')));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bible_study_messages' AND policyname = 'bible_study_msgs_rls_insert') THEN
    CREATE POLICY bible_study_msgs_rls_insert ON bible_study_messages FOR INSERT TO public
      WITH CHECK (user_id = (SELECT current_setting('app.current_user_id')));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bible_study_messages' AND policyname = 'bible_study_msgs_rls_update') THEN
    CREATE POLICY bible_study_msgs_rls_update ON bible_study_messages FOR UPDATE TO public
      USING (user_id = (SELECT current_setting('app.current_user_id')));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bible_study_messages' AND policyname = 'bible_study_msgs_rls_delete') THEN
    CREATE POLICY bible_study_msgs_rls_delete ON bible_study_messages FOR DELETE TO public
      USING (user_id = (SELECT current_setting('app.current_user_id')));
  END IF;
END $$;
