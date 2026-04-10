-- API Keys system: enables external applications to authenticate with ARI
-- Run this migration to add api_keys and api_key_usage_logs tables

-- =============================================================================
-- API Keys table
-- =============================================================================
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  label VARCHAR(255) NOT NULL,
  key_hash TEXT NOT NULL,
  key_prefix VARCHAR(12) NOT NULL,
  expires_at TIMESTAMPTZ,
  allowed_ips TEXT[],
  last_used_at TIMESTAMPTZ,
  request_count INTEGER NOT NULL DEFAULT 0,
  revoked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys (key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys (user_id);

-- Enable RLS
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- RLS policies (same pattern as module_settings)
DROP POLICY IF EXISTS api_keys_rls_select ON api_keys;
CREATE POLICY api_keys_rls_select ON api_keys
  AS PERMISSIVE FOR SELECT TO public
  USING (user_id = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS api_keys_rls_insert ON api_keys;
CREATE POLICY api_keys_rls_insert ON api_keys
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (user_id = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS api_keys_rls_update ON api_keys;
CREATE POLICY api_keys_rls_update ON api_keys
  AS PERMISSIVE FOR UPDATE TO public
  USING (user_id = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS api_keys_rls_delete ON api_keys;
CREATE POLICY api_keys_rls_delete ON api_keys
  AS PERMISSIVE FOR DELETE TO public
  USING (user_id = (SELECT current_setting('app.current_user_id')));

-- =============================================================================
-- API Key Usage Logs table
-- =============================================================================
CREATE TABLE IF NOT EXISTS api_key_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id TEXT NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  method VARCHAR(10) NOT NULL,
  status_code INTEGER NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_key_usage_logs_key_created
  ON api_key_usage_logs (api_key_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_key_usage_logs_user_id
  ON api_key_usage_logs (user_id);

-- Enable RLS
ALTER TABLE api_key_usage_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies
DROP POLICY IF EXISTS api_key_usage_logs_rls_select ON api_key_usage_logs;
CREATE POLICY api_key_usage_logs_rls_select ON api_key_usage_logs
  AS PERMISSIVE FOR SELECT TO public
  USING (user_id = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS api_key_usage_logs_rls_insert ON api_key_usage_logs;
CREATE POLICY api_key_usage_logs_rls_insert ON api_key_usage_logs
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (user_id = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS api_key_usage_logs_rls_update ON api_key_usage_logs;
CREATE POLICY api_key_usage_logs_rls_update ON api_key_usage_logs
  AS PERMISSIVE FOR UPDATE TO public
  USING (user_id = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS api_key_usage_logs_rls_delete ON api_key_usage_logs;
CREATE POLICY api_key_usage_logs_rls_delete ON api_key_usage_logs
  AS PERMISSIVE FOR DELETE TO public
  USING (user_id = (SELECT current_setting('app.current_user_id')));
