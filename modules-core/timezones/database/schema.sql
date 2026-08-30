-- Timezones module schema
-- Idempotent: safe to run on every module enable.
-- Mirrors modules-custom/timezones/database/schema.ts
--
-- PER-USER (private): each user keeps their own list of people. The API
-- filters every SELECT/UPDATE/DELETE by user_id = user.id — that filter is
-- the real tenant boundary; these policies are defense-in-depth because the
-- default DB role has BYPASSRLS (see docs/SECURITY.md).

CREATE TABLE IF NOT EXISTS timezone_people (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  name VARCHAR(100) NOT NULL,
  timezone VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- (user_id, created_at) also serves plain `WHERE user_id = ...` lookups, so a
-- separate single-column index would only add write amplification.
CREATE INDEX IF NOT EXISTS idx_timezone_people_user_created ON timezone_people(user_id, created_at ASC);

-- Backstop for updated_at. The API sets it explicitly, but any other writer
-- (a manual SQL fix, an import, a future bulk re-zone) would otherwise leave it
-- stale. CREATE OR REPLACE + DROP TRIGGER IF EXISTS keeps this re-runnable.
CREATE OR REPLACE FUNCTION timezone_people_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS timezone_people_set_updated_at ON timezone_people;
CREATE TRIGGER timezone_people_set_updated_at
  BEFORE UPDATE ON timezone_people
  FOR EACH ROW EXECUTE FUNCTION timezone_people_touch_updated_at();

ALTER TABLE timezone_people ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS timezone_people_rls_select ON timezone_people;
CREATE POLICY timezone_people_rls_select ON timezone_people FOR SELECT
  USING (user_id = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS timezone_people_rls_insert ON timezone_people;
CREATE POLICY timezone_people_rls_insert ON timezone_people FOR INSERT
  WITH CHECK (user_id = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS timezone_people_rls_update ON timezone_people;
CREATE POLICY timezone_people_rls_update ON timezone_people FOR UPDATE
  USING (user_id = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS timezone_people_rls_delete ON timezone_people;
CREATE POLICY timezone_people_rls_delete ON timezone_people FOR DELETE
  USING (user_id = (SELECT current_setting('app.current_user_id')));
