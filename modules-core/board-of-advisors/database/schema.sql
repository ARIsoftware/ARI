-- Board of Advisors module schema
-- Idempotent: safe to run on every module enable.
-- Mirrors modules-custom/board-of-advisors/database/schema.ts

CREATE TABLE IF NOT EXISTS board_advisors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(2000) NOT NULL,
  color VARCHAR(20) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Voice playback (ElevenLabs). sex drives the automatic voice pick; voice_id is
-- an optional explicit ElevenLabs voice (NULL = auto by sex, resolved at playback).
ALTER TABLE board_advisors ADD COLUMN IF NOT EXISTS sex VARCHAR(16) NOT NULL DEFAULT 'not_specified';
ALTER TABLE board_advisors ADD COLUMN IF NOT EXISTS voice_id VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_board_advisors_user_id ON board_advisors(user_id);
CREATE INDEX IF NOT EXISTS idx_board_advisors_user_sort ON board_advisors(user_id, sort_order ASC);

ALTER TABLE board_advisors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS board_advisors_rls_select ON board_advisors;
CREATE POLICY board_advisors_rls_select ON board_advisors FOR SELECT
  USING (user_id = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS board_advisors_rls_insert ON board_advisors;
CREATE POLICY board_advisors_rls_insert ON board_advisors FOR INSERT
  WITH CHECK (user_id = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS board_advisors_rls_update ON board_advisors;
CREATE POLICY board_advisors_rls_update ON board_advisors FOR UPDATE
  USING (user_id = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS board_advisors_rls_delete ON board_advisors;
CREATE POLICY board_advisors_rls_delete ON board_advisors FOR DELETE
  USING (user_id = (SELECT current_setting('app.current_user_id')));


CREATE TABLE IF NOT EXISTS board_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  title VARCHAR(200) NOT NULL DEFAULT 'New discussion',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_board_conversations_user_id ON board_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_board_conversations_user_updated ON board_conversations(user_id, updated_at DESC);

ALTER TABLE board_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS board_conversations_rls_select ON board_conversations;
CREATE POLICY board_conversations_rls_select ON board_conversations FOR SELECT
  USING (user_id = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS board_conversations_rls_insert ON board_conversations;
CREATE POLICY board_conversations_rls_insert ON board_conversations FOR INSERT
  WITH CHECK (user_id = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS board_conversations_rls_update ON board_conversations;
CREATE POLICY board_conversations_rls_update ON board_conversations FOR UPDATE
  USING (user_id = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS board_conversations_rls_delete ON board_conversations;
CREATE POLICY board_conversations_rls_delete ON board_conversations FOR DELETE
  USING (user_id = (SELECT current_setting('app.current_user_id')));


-- role is either 'user' (the human asking) or 'advisor' (one persona's reply).
-- advisor_name/advisor_color are snapshots so history renders correctly even
-- after the advisor is deleted (advisor_id then becomes NULL).
CREATE TABLE IF NOT EXISTS board_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES board_conversations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  role VARCHAR(16) NOT NULL,
  advisor_id UUID REFERENCES board_advisors(id) ON DELETE SET NULL,
  advisor_name VARCHAR(100),
  advisor_color VARCHAR(20),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_board_messages_user_id ON board_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_board_messages_conversation_created ON board_messages(conversation_id, created_at ASC);
-- FK columns are not auto-indexed; advisor deletion (ON DELETE SET NULL) would
-- otherwise sequentially scan board_messages.
CREATE INDEX IF NOT EXISTS idx_board_messages_advisor_id ON board_messages(advisor_id);

ALTER TABLE board_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS board_messages_rls_select ON board_messages;
CREATE POLICY board_messages_rls_select ON board_messages FOR SELECT
  USING (user_id = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS board_messages_rls_insert ON board_messages;
CREATE POLICY board_messages_rls_insert ON board_messages FOR INSERT
  WITH CHECK (user_id = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS board_messages_rls_update ON board_messages;
CREATE POLICY board_messages_rls_update ON board_messages FOR UPDATE
  USING (user_id = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS board_messages_rls_delete ON board_messages;
CREATE POLICY board_messages_rls_delete ON board_messages FOR DELETE
  USING (user_id = (SELECT current_setting('app.current_user_id')));
