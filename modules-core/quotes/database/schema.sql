-- Quotes module schema
-- Idempotent: safe to run on every module enable.
-- Mirrors modules-core/quotes/database/schema.ts

CREATE TABLE IF NOT EXISTS quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  quote TEXT NOT NULL,
  author TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS quotes_user_id_idx ON quotes(user_id);
CREATE INDEX IF NOT EXISTS quotes_created_at_idx ON quotes(created_at DESC);

ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS quotes_rls_select ON quotes;
CREATE POLICY quotes_rls_select ON quotes FOR SELECT
  USING ((SELECT app.can_access_shared()));

DROP POLICY IF EXISTS quotes_rls_insert ON quotes;
CREATE POLICY quotes_rls_insert ON quotes FOR INSERT
  WITH CHECK (user_id::text = (SELECT current_setting('app.current_user_id', true)));

DROP POLICY IF EXISTS quotes_rls_update ON quotes;
CREATE POLICY quotes_rls_update ON quotes FOR UPDATE
  USING ((SELECT app.can_access_shared()))
  WITH CHECK ((SELECT app.can_access_shared()));

DROP POLICY IF EXISTS quotes_rls_delete ON quotes;
CREATE POLICY quotes_rls_delete ON quotes FOR DELETE
  USING ((SELECT app.can_access_shared()));

-- Shared table: user_id may never be reassigned (see app.prevent_user_id_reassignment
-- in lib/db/setup.sql — inert until the app pool sets app.enforced).
DROP TRIGGER IF EXISTS quotes_user_id_immutable ON quotes;
CREATE TRIGGER quotes_user_id_immutable
  BEFORE UPDATE ON quotes
  FOR EACH ROW
  WHEN (OLD.user_id IS DISTINCT FROM NEW.user_id)
  EXECUTE FUNCTION app.prevent_user_id_reassignment();
