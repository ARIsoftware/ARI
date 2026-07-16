-- Chat module schema
-- Idempotent: safe to run on every module enable.
-- Mirrors modules-custom/chat/database/schema.ts

CREATE TABLE IF NOT EXISTS chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  title VARCHAR(200) NOT NULL DEFAULT 'New chat',
  provider VARCHAR(32) NOT NULL,
  model VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_conversations_user_id ON chat_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_user_updated ON chat_conversations(user_id, updated_at DESC);

ALTER TABLE chat_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_conversations_rls_select ON chat_conversations;
CREATE POLICY chat_conversations_rls_select ON chat_conversations FOR SELECT
  USING (user_id = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS chat_conversations_rls_insert ON chat_conversations;
CREATE POLICY chat_conversations_rls_insert ON chat_conversations FOR INSERT
  WITH CHECK (user_id = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS chat_conversations_rls_update ON chat_conversations;
CREATE POLICY chat_conversations_rls_update ON chat_conversations FOR UPDATE
  USING (user_id = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS chat_conversations_rls_delete ON chat_conversations;
CREATE POLICY chat_conversations_rls_delete ON chat_conversations FOR DELETE
  USING (user_id = (SELECT current_setting('app.current_user_id')));


CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  role VARCHAR(16) NOT NULL,
  content TEXT NOT NULL,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id ON chat_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_created ON chat_messages(conversation_id, created_at ASC);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_messages_rls_select ON chat_messages;
CREATE POLICY chat_messages_rls_select ON chat_messages FOR SELECT
  USING (user_id = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS chat_messages_rls_insert ON chat_messages;
CREATE POLICY chat_messages_rls_insert ON chat_messages FOR INSERT
  WITH CHECK (user_id = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS chat_messages_rls_update ON chat_messages;
CREATE POLICY chat_messages_rls_update ON chat_messages FOR UPDATE
  USING (user_id = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS chat_messages_rls_delete ON chat_messages;
CREATE POLICY chat_messages_rls_delete ON chat_messages FOR DELETE
  USING (user_id = (SELECT current_setting('app.current_user_id')));


CREATE TABLE IF NOT EXISTS chat_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  conversation_id UUID REFERENCES chat_conversations(id) ON DELETE SET NULL,
  filename VARCHAR(512) NOT NULL,
  original_name VARCHAR(512) NOT NULL,
  mime VARCHAR(128) NOT NULL,
  size INTEGER NOT NULL,
  bucket VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_uploads_user_id ON chat_uploads(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_uploads_user_created ON chat_uploads(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_uploads_conversation_id ON chat_uploads(conversation_id);

ALTER TABLE chat_uploads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_uploads_rls_select ON chat_uploads;
CREATE POLICY chat_uploads_rls_select ON chat_uploads FOR SELECT
  USING (user_id = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS chat_uploads_rls_insert ON chat_uploads;
CREATE POLICY chat_uploads_rls_insert ON chat_uploads FOR INSERT
  WITH CHECK (user_id = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS chat_uploads_rls_update ON chat_uploads;
CREATE POLICY chat_uploads_rls_update ON chat_uploads FOR UPDATE
  USING (user_id = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS chat_uploads_rls_delete ON chat_uploads;
CREATE POLICY chat_uploads_rls_delete ON chat_uploads FOR DELETE
  USING (user_id = (SELECT current_setting('app.current_user_id')));


-- ─── CHECK constraints ───────────────────────────────────────────────────
-- Enum-like columns are Zod-validated at the API layer; these constraints
-- guard against invalid rows from any other write path. Added NOT VALID (like
-- the FKs below) so re-enabling on an install that already holds an
-- out-of-enum row (e.g. a provider renamed in a future release, or a restored
-- backup) never aborts the whole schema transaction and locks the user out of
-- the module — new writes are still enforced. Operators can run
-- ALTER TABLE ... VALIDATE CONSTRAINT later to check existing rows.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chat_conversations_provider_check'
      AND conrelid = 'chat_conversations'::regclass
  ) THEN
    ALTER TABLE chat_conversations
      ADD CONSTRAINT chat_conversations_provider_check
      CHECK (provider IN ('openai', 'anthropic', 'gemini', 'openrouter'))
      NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chat_messages_role_check'
      AND conrelid = 'chat_messages'::regclass
  ) THEN
    ALTER TABLE chat_messages
      ADD CONSTRAINT chat_messages_role_check
      CHECK (role IN ('user', 'assistant', 'system'))
      NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chat_uploads_size_check'
      AND conrelid = 'chat_uploads'::regclass
  ) THEN
    ALTER TABLE chat_uploads
      ADD CONSTRAINT chat_uploads_size_check
      CHECK (size >= 0)
      NOT VALID;
  END IF;
END $$;


-- ─── Foreign keys to the Better Auth user table ─────────────────────────
-- Deleting a user cascades to their chat data instead of orphaning it.
-- Added NOT VALID so re-enabling on installs with pre-existing rows never
-- fails; new writes still hit the constraint and ON DELETE CASCADE still
-- fires. Operators can run ALTER TABLE ... VALIDATE CONSTRAINT later.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chat_conversations_user_id_fkey'
      AND conrelid = 'chat_conversations'::regclass
  ) THEN
    ALTER TABLE chat_conversations
      ADD CONSTRAINT chat_conversations_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE
      NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chat_messages_user_id_fkey'
      AND conrelid = 'chat_messages'::regclass
  ) THEN
    ALTER TABLE chat_messages
      ADD CONSTRAINT chat_messages_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE
      NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chat_uploads_user_id_fkey'
      AND conrelid = 'chat_uploads'::regclass
  ) THEN
    ALTER TABLE chat_uploads
      ADD CONSTRAINT chat_uploads_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE
      NOT VALID;
  END IF;
END $$;
