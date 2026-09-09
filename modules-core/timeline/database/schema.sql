-- Timeline module schema
-- Idempotent: safe to run on every module enable.
-- Mirrors modules-custom/timeline/database/schema.ts
--
-- PER-USER (private) table: each user only sees their own events.
-- The real tenant boundary is the API-layer user_id filter (see
-- api/events/route.ts); these RLS policies are defense-in-depth.

CREATE TABLE IF NOT EXISTS timeline_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  name VARCHAR(100) NOT NULL,
  event_date DATE NOT NULL,
  color VARCHAR(7),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Added after initial release; upgrades existing installs.
ALTER TABLE timeline_events ADD COLUMN IF NOT EXISTS color VARCHAR(7);

-- Narrow color from the original VARCHAR(32) to VARCHAR(7) on existing
-- installs. Safe: the color_hex CHECK below already limits values to 7 chars.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'timeline_events'
      AND column_name = 'color' AND character_maximum_length > 7
  ) THEN
    ALTER TABLE timeline_events ALTER COLUMN color TYPE VARCHAR(7);
  END IF;
END $$;

-- Defense-in-depth: DB-level guard matching the API's #RRGGBB validation.
-- (Postgres has no ADD CONSTRAINT IF NOT EXISTS, hence the DO block.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'timeline_events_color_hex'
      AND conrelid = 'timeline_events'::regclass
  ) THEN
    ALTER TABLE timeline_events ADD CONSTRAINT timeline_events_color_hex
      CHECK (color IS NULL OR color ~ '^#[0-9a-fA-F]{6}$');
  END IF;
END $$;

-- FK to the Better Auth user table: deleting a user cascades to their
-- timeline events instead of orphaning them. Added NOT VALID so re-enabling
-- on installs with pre-existing rows never fails; new writes still hit the
-- constraint and ON DELETE CASCADE still fires. Operators can run
-- ALTER TABLE ... VALIDATE CONSTRAINT later.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'timeline_events_user_id_fkey'
      AND conrelid = 'timeline_events'::regclass
  ) THEN
    ALTER TABLE timeline_events
      ADD CONSTRAINT timeline_events_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE
      NOT VALID;
  END IF;
END $$;

-- The composite index covers user_id-only lookups via its leftmost prefix;
-- the old single-column index is redundant and dropped on upgrade.
DROP INDEX IF EXISTS idx_timeline_events_user_id;
CREATE INDEX IF NOT EXISTS idx_timeline_events_user_date ON timeline_events(user_id, event_date);

ALTER TABLE timeline_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS timeline_events_rls_select ON timeline_events;
CREATE POLICY timeline_events_rls_select ON timeline_events FOR SELECT
  USING (user_id = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS timeline_events_rls_insert ON timeline_events;
CREATE POLICY timeline_events_rls_insert ON timeline_events FOR INSERT
  WITH CHECK (user_id = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS timeline_events_rls_update ON timeline_events;
CREATE POLICY timeline_events_rls_update ON timeline_events FOR UPDATE
  USING (user_id = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS timeline_events_rls_delete ON timeline_events;
CREATE POLICY timeline_events_rls_delete ON timeline_events FOR DELETE
  USING (user_id = (SELECT current_setting('app.current_user_id')));
