-- Contacts module schema
-- Idempotent: safe to run on every module enable.
-- Mirrors modules-core/contacts/database/schema.ts

CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  category TEXT NOT NULL,
  description TEXT,
  company TEXT,
  address TEXT,
  website TEXT,
  birthday DATE,
  next_contact_date DATE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  user_id TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_contacts_category ON contacts(category);
CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts(name);
CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_user_id_created_at ON contacts(user_id, created_at DESC);

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contacts_rls_select ON contacts;
CREATE POLICY contacts_rls_select ON contacts FOR SELECT
  USING ((SELECT app.can_access_shared()));

DROP POLICY IF EXISTS contacts_rls_insert ON contacts;
CREATE POLICY contacts_rls_insert ON contacts FOR INSERT
  WITH CHECK (user_id::text = (SELECT current_setting('app.current_user_id', true)));

DROP POLICY IF EXISTS contacts_rls_update ON contacts;
CREATE POLICY contacts_rls_update ON contacts FOR UPDATE
  USING ((SELECT app.can_access_shared()))
  WITH CHECK ((SELECT app.can_access_shared()));

DROP POLICY IF EXISTS contacts_rls_delete ON contacts;
CREATE POLICY contacts_rls_delete ON contacts FOR DELETE
  USING ((SELECT app.can_access_shared()));

-- Shared table: user_id may never be reassigned (see app.prevent_user_id_reassignment
-- in lib/db/setup.sql — inert until the app pool sets app.enforced).
DROP TRIGGER IF EXISTS contacts_user_id_immutable ON contacts;
CREATE TRIGGER contacts_user_id_immutable
  BEFORE UPDATE ON contacts
  FOR EACH ROW
  WHEN (OLD.user_id IS DISTINCT FROM NEW.user_id)
  EXECUTE FUNCTION app.prevent_user_id_reassignment();
