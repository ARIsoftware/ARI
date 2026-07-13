-- Health Data module schema
-- Idempotent: safe to run on every module enable.
-- Mirrors modules-custom/health-data/database/schema.ts
--
-- Retention model: every table cascades from health_data_imports, whose
-- expires_at is set to upload time + 1 hour. Expired imports are deleted
-- (cascading to all child rows) by every module API request before it
-- reads or writes anything.

CREATE TABLE IF NOT EXISTS health_data_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing',
  progress INTEGER NOT NULL DEFAULT 0,
  phase TEXT,
  records_parsed BIGINT NOT NULL DEFAULT 0,
  error TEXT,
  export_date TEXT,
  locale TEXT,
  profile JSONB,
  clinical JSONB,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT health_data_imports_status_check
    CHECK (status IN ('processing', 'completed', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_health_data_imports_user_id ON health_data_imports(user_id);
CREATE INDEX IF NOT EXISTS idx_health_data_imports_expires_at ON health_data_imports(expires_at);

CREATE TABLE IF NOT EXISTS health_data_daily_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  import_id UUID NOT NULL REFERENCES health_data_imports(id) ON DELETE CASCADE,
  metric_type TEXT NOT NULL,
  metric_date DATE NOT NULL,
  unit TEXT,
  value_sum DOUBLE PRECISION,
  value_min DOUBLE PRECISION,
  value_max DOUBLE PRECISION,
  value_avg DOUBLE PRECISION,
  sample_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_health_data_daily_metrics_user_type_date
  ON health_data_daily_metrics(user_id, metric_type, metric_date);
CREATE INDEX IF NOT EXISTS idx_health_data_daily_metrics_import_id
  ON health_data_daily_metrics(import_id);

CREATE TABLE IF NOT EXISTS health_data_workouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  import_id UUID NOT NULL REFERENCES health_data_imports(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  duration_min DOUBLE PRECISION,
  distance_km DOUBLE PRECISION,
  energy_kcal DOUBLE PRECISION,
  avg_heart_rate DOUBLE PRECISION,
  max_heart_rate DOUBLE PRECISION,
  elevation_gain_m DOUBLE PRECISION,
  source_name TEXT
);

CREATE INDEX IF NOT EXISTS idx_health_data_workouts_user_start
  ON health_data_workouts(user_id, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_health_data_workouts_import_id
  ON health_data_workouts(import_id);

CREATE TABLE IF NOT EXISTS health_data_activity_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  import_id UUID NOT NULL REFERENCES health_data_imports(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  active_energy DOUBLE PRECISION,
  active_energy_goal DOUBLE PRECISION,
  exercise_minutes DOUBLE PRECISION,
  exercise_goal DOUBLE PRECISION,
  stand_hours DOUBLE PRECISION,
  stand_goal DOUBLE PRECISION
);

CREATE INDEX IF NOT EXISTS idx_health_data_activity_days_user_day
  ON health_data_activity_days(user_id, day);
CREATE INDEX IF NOT EXISTS idx_health_data_activity_days_import_id
  ON health_data_activity_days(import_id);

CREATE TABLE IF NOT EXISTS health_data_sleep_nights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  import_id UUID NOT NULL REFERENCES health_data_imports(id) ON DELETE CASCADE,
  night_date DATE NOT NULL,
  start_time TEXT,
  end_time TEXT,
  in_bed_min DOUBLE PRECISION,
  asleep_min DOUBLE PRECISION,
  core_min DOUBLE PRECISION,
  deep_min DOUBLE PRECISION,
  rem_min DOUBLE PRECISION,
  awake_min DOUBLE PRECISION
);

CREATE INDEX IF NOT EXISTS idx_health_data_sleep_nights_user_date
  ON health_data_sleep_nights(user_id, night_date);
CREATE INDEX IF NOT EXISTS idx_health_data_sleep_nights_import_id
  ON health_data_sleep_nights(import_id);

CREATE TABLE IF NOT EXISTS health_data_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  import_id UUID NOT NULL REFERENCES health_data_imports(id) ON DELETE CASCADE,
  route_date DATE NOT NULL,
  started_at TEXT,
  distance_km DOUBLE PRECISION,
  duration_min DOUBLE PRECISION,
  point_count INTEGER NOT NULL DEFAULT 0,
  points JSONB
);

CREATE INDEX IF NOT EXISTS idx_health_data_routes_user_date
  ON health_data_routes(user_id, route_date);
CREATE INDEX IF NOT EXISTS idx_health_data_routes_import_id
  ON health_data_routes(import_id);

CREATE TABLE IF NOT EXISTS health_data_ecgs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  import_id UUID NOT NULL REFERENCES health_data_imports(id) ON DELETE CASCADE,
  recorded_at TEXT,
  classification TEXT,
  average_heart_rate DOUBLE PRECISION,
  sampling_frequency_hz DOUBLE PRECISION,
  sample_count INTEGER,
  duration_sec DOUBLE PRECISION,
  device TEXT,
  waveform JSONB
);

CREATE INDEX IF NOT EXISTS idx_health_data_ecgs_user_recorded
  ON health_data_ecgs(user_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_health_data_ecgs_import_id
  ON health_data_ecgs(import_id);

-- Added after initial release: reported symptoms and the full-resolution strip
ALTER TABLE health_data_ecgs ADD COLUMN IF NOT EXISTS symptoms TEXT;
ALTER TABLE health_data_ecgs ADD COLUMN IF NOT EXISTS waveform_full JSONB;

-- Added after initial release: parser-origin local times were TIMESTAMPTZ,
-- which normalized to UTC and discarded the device-local offset. They are
-- now TEXT storing the parser's ISO-with-offset strings verbatim (e.g.
-- "2024-01-15T20:30:00-05:00"). The USING clause makes the conversion valid
-- from TIMESTAMPTZ and a no-op when the column is already TEXT, so these are
-- safe to re-run. Dependent indexes are rebuilt automatically by Postgres.
-- (expires_at/created_at/updated_at on health_data_imports are true instants
-- and stay TIMESTAMPTZ.)
ALTER TABLE health_data_imports ALTER COLUMN export_date TYPE TEXT USING export_date::text;
ALTER TABLE health_data_workouts ALTER COLUMN start_time TYPE TEXT USING start_time::text;
ALTER TABLE health_data_workouts ALTER COLUMN end_time TYPE TEXT USING end_time::text;
ALTER TABLE health_data_sleep_nights ALTER COLUMN start_time TYPE TEXT USING start_time::text;
ALTER TABLE health_data_sleep_nights ALTER COLUMN end_time TYPE TEXT USING end_time::text;
ALTER TABLE health_data_routes ALTER COLUMN started_at TYPE TEXT USING started_at::text;
ALTER TABLE health_data_ecgs ALTER COLUMN recorded_at TYPE TEXT USING recorded_at::text;

ALTER TABLE health_data_routes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS health_data_routes_rls_select ON health_data_routes;
CREATE POLICY health_data_routes_rls_select ON health_data_routes FOR SELECT
  USING (user_id = (SELECT current_setting('app.current_user_id')));
DROP POLICY IF EXISTS health_data_routes_rls_insert ON health_data_routes;
CREATE POLICY health_data_routes_rls_insert ON health_data_routes FOR INSERT
  WITH CHECK (user_id = (SELECT current_setting('app.current_user_id')));
DROP POLICY IF EXISTS health_data_routes_rls_update ON health_data_routes;
CREATE POLICY health_data_routes_rls_update ON health_data_routes FOR UPDATE
  USING (user_id = (SELECT current_setting('app.current_user_id')));
DROP POLICY IF EXISTS health_data_routes_rls_delete ON health_data_routes;
CREATE POLICY health_data_routes_rls_delete ON health_data_routes FOR DELETE
  USING (user_id = (SELECT current_setting('app.current_user_id')));

ALTER TABLE health_data_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_data_daily_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_data_workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_data_activity_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_data_sleep_nights ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_data_ecgs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS health_data_imports_rls_select ON health_data_imports;
CREATE POLICY health_data_imports_rls_select ON health_data_imports FOR SELECT
  USING (user_id = (SELECT current_setting('app.current_user_id')));
DROP POLICY IF EXISTS health_data_imports_rls_insert ON health_data_imports;
CREATE POLICY health_data_imports_rls_insert ON health_data_imports FOR INSERT
  WITH CHECK (user_id = (SELECT current_setting('app.current_user_id')));
DROP POLICY IF EXISTS health_data_imports_rls_update ON health_data_imports;
CREATE POLICY health_data_imports_rls_update ON health_data_imports FOR UPDATE
  USING (user_id = (SELECT current_setting('app.current_user_id')));
DROP POLICY IF EXISTS health_data_imports_rls_delete ON health_data_imports;
CREATE POLICY health_data_imports_rls_delete ON health_data_imports FOR DELETE
  USING (user_id = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS health_data_daily_metrics_rls_select ON health_data_daily_metrics;
CREATE POLICY health_data_daily_metrics_rls_select ON health_data_daily_metrics FOR SELECT
  USING (user_id = (SELECT current_setting('app.current_user_id')));
DROP POLICY IF EXISTS health_data_daily_metrics_rls_insert ON health_data_daily_metrics;
CREATE POLICY health_data_daily_metrics_rls_insert ON health_data_daily_metrics FOR INSERT
  WITH CHECK (user_id = (SELECT current_setting('app.current_user_id')));
DROP POLICY IF EXISTS health_data_daily_metrics_rls_update ON health_data_daily_metrics;
CREATE POLICY health_data_daily_metrics_rls_update ON health_data_daily_metrics FOR UPDATE
  USING (user_id = (SELECT current_setting('app.current_user_id')));
DROP POLICY IF EXISTS health_data_daily_metrics_rls_delete ON health_data_daily_metrics;
CREATE POLICY health_data_daily_metrics_rls_delete ON health_data_daily_metrics FOR DELETE
  USING (user_id = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS health_data_workouts_rls_select ON health_data_workouts;
CREATE POLICY health_data_workouts_rls_select ON health_data_workouts FOR SELECT
  USING (user_id = (SELECT current_setting('app.current_user_id')));
DROP POLICY IF EXISTS health_data_workouts_rls_insert ON health_data_workouts;
CREATE POLICY health_data_workouts_rls_insert ON health_data_workouts FOR INSERT
  WITH CHECK (user_id = (SELECT current_setting('app.current_user_id')));
DROP POLICY IF EXISTS health_data_workouts_rls_update ON health_data_workouts;
CREATE POLICY health_data_workouts_rls_update ON health_data_workouts FOR UPDATE
  USING (user_id = (SELECT current_setting('app.current_user_id')));
DROP POLICY IF EXISTS health_data_workouts_rls_delete ON health_data_workouts;
CREATE POLICY health_data_workouts_rls_delete ON health_data_workouts FOR DELETE
  USING (user_id = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS health_data_activity_days_rls_select ON health_data_activity_days;
CREATE POLICY health_data_activity_days_rls_select ON health_data_activity_days FOR SELECT
  USING (user_id = (SELECT current_setting('app.current_user_id')));
DROP POLICY IF EXISTS health_data_activity_days_rls_insert ON health_data_activity_days;
CREATE POLICY health_data_activity_days_rls_insert ON health_data_activity_days FOR INSERT
  WITH CHECK (user_id = (SELECT current_setting('app.current_user_id')));
DROP POLICY IF EXISTS health_data_activity_days_rls_update ON health_data_activity_days;
CREATE POLICY health_data_activity_days_rls_update ON health_data_activity_days FOR UPDATE
  USING (user_id = (SELECT current_setting('app.current_user_id')));
DROP POLICY IF EXISTS health_data_activity_days_rls_delete ON health_data_activity_days;
CREATE POLICY health_data_activity_days_rls_delete ON health_data_activity_days FOR DELETE
  USING (user_id = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS health_data_sleep_nights_rls_select ON health_data_sleep_nights;
CREATE POLICY health_data_sleep_nights_rls_select ON health_data_sleep_nights FOR SELECT
  USING (user_id = (SELECT current_setting('app.current_user_id')));
DROP POLICY IF EXISTS health_data_sleep_nights_rls_insert ON health_data_sleep_nights;
CREATE POLICY health_data_sleep_nights_rls_insert ON health_data_sleep_nights FOR INSERT
  WITH CHECK (user_id = (SELECT current_setting('app.current_user_id')));
DROP POLICY IF EXISTS health_data_sleep_nights_rls_update ON health_data_sleep_nights;
CREATE POLICY health_data_sleep_nights_rls_update ON health_data_sleep_nights FOR UPDATE
  USING (user_id = (SELECT current_setting('app.current_user_id')));
DROP POLICY IF EXISTS health_data_sleep_nights_rls_delete ON health_data_sleep_nights;
CREATE POLICY health_data_sleep_nights_rls_delete ON health_data_sleep_nights FOR DELETE
  USING (user_id = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS health_data_ecgs_rls_select ON health_data_ecgs;
CREATE POLICY health_data_ecgs_rls_select ON health_data_ecgs FOR SELECT
  USING (user_id = (SELECT current_setting('app.current_user_id')));
DROP POLICY IF EXISTS health_data_ecgs_rls_insert ON health_data_ecgs;
CREATE POLICY health_data_ecgs_rls_insert ON health_data_ecgs FOR INSERT
  WITH CHECK (user_id = (SELECT current_setting('app.current_user_id')));
DROP POLICY IF EXISTS health_data_ecgs_rls_update ON health_data_ecgs;
CREATE POLICY health_data_ecgs_rls_update ON health_data_ecgs FOR UPDATE
  USING (user_id = (SELECT current_setting('app.current_user_id')));
DROP POLICY IF EXISTS health_data_ecgs_rls_delete ON health_data_ecgs;
CREATE POLICY health_data_ecgs_rls_delete ON health_data_ecgs FOR DELETE
  USING (user_id = (SELECT current_setting('app.current_user_id')));
