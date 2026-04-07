-- Module Template schema
-- Idempotent: safe to run on every module enable.
-- Mirrors modules-core/module-template/database/schema.ts

CREATE TABLE IF NOT EXISTS module_template_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  message VARCHAR(500) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_module_template_entries_user_id ON module_template_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_module_template_entries_created_at ON module_template_entries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_module_template_entries_user_created ON module_template_entries(user_id, created_at DESC);

ALTER TABLE module_template_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS module_template_entries_rls_select ON module_template_entries;
CREATE POLICY module_template_entries_rls_select ON module_template_entries FOR SELECT
  USING (user_id = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS module_template_entries_rls_insert ON module_template_entries;
CREATE POLICY module_template_entries_rls_insert ON module_template_entries FOR INSERT
  WITH CHECK (user_id = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS module_template_entries_rls_update ON module_template_entries;
CREATE POLICY module_template_entries_rls_update ON module_template_entries FOR UPDATE
  USING (user_id = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS module_template_entries_rls_delete ON module_template_entries;
CREATE POLICY module_template_entries_rls_delete ON module_template_entries FOR DELETE
  USING (user_id = (SELECT current_setting('app.current_user_id')));
