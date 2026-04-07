-- Notepad module schema
-- Idempotent: safe to run on every module enable.
-- Mirrors modules-core/notepad/database/schema.ts

CREATE TABLE IF NOT EXISTS notepad (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT notepad_user_id_key UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_notepad_user_id ON notepad(user_id);

ALTER TABLE notepad ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notepad_rls_select ON notepad;
CREATE POLICY notepad_rls_select ON notepad FOR SELECT
  USING (user_id::text = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS notepad_rls_insert ON notepad;
CREATE POLICY notepad_rls_insert ON notepad FOR INSERT
  WITH CHECK (user_id::text = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS notepad_rls_update ON notepad;
CREATE POLICY notepad_rls_update ON notepad FOR UPDATE
  USING (user_id::text = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS notepad_rls_delete ON notepad;
CREATE POLICY notepad_rls_delete ON notepad FOR DELETE
  USING (user_id::text = (SELECT current_setting('app.current_user_id')));

CREATE TABLE IF NOT EXISTS notepad_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  revision_number INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_notepad_revisions_user_id ON notepad_revisions(user_id);
CREATE INDEX IF NOT EXISTS idx_notepad_revisions_user_revision ON notepad_revisions(user_id, revision_number DESC);

ALTER TABLE notepad_revisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notepad_revisions_rls_select ON notepad_revisions;
CREATE POLICY notepad_revisions_rls_select ON notepad_revisions FOR SELECT
  USING (user_id::text = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS notepad_revisions_rls_insert ON notepad_revisions;
CREATE POLICY notepad_revisions_rls_insert ON notepad_revisions FOR INSERT
  WITH CHECK (user_id::text = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS notepad_revisions_rls_update ON notepad_revisions;
CREATE POLICY notepad_revisions_rls_update ON notepad_revisions FOR UPDATE
  USING (user_id::text = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS notepad_revisions_rls_delete ON notepad_revisions;
CREATE POLICY notepad_revisions_rls_delete ON notepad_revisions FOR DELETE
  USING (user_id::text = (SELECT current_setting('app.current_user_id')));
