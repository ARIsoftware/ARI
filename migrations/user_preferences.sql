-- User Preferences Table
-- Stores workspace identity fields and system settings like timezone
-- Used by: /welcome Personal tab, /settings General tab, backup-manager module

CREATE TABLE IF NOT EXISTS user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  -- Workspace Identity fields (from /welcome Personal tab)
  name VARCHAR(255),
  email VARCHAR(255),
  title VARCHAR(255),
  company_name VARCHAR(255),
  country VARCHAR(100),
  city VARCHAR(100),
  linkedin_url VARCHAR(500),
  -- System settings
  timezone VARCHAR(50) DEFAULT 'UTC',      -- e.g., 'America/New_York'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  -- Ensure one preferences record per user
  CONSTRAINT user_preferences_user_id_key UNIQUE (user_id)
);

-- Create index for user_id lookups
CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences(user_id);

-- Enable RLS
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own preferences" ON user_preferences
  FOR SELECT TO public
  USING (user_id = current_setting('app.user_id', true)::text);

CREATE POLICY "Users can insert their own preferences" ON user_preferences
  FOR INSERT TO public
  WITH CHECK (user_id = current_setting('app.user_id', true)::text);

CREATE POLICY "Users can update their own preferences" ON user_preferences
  FOR UPDATE TO public
  USING (user_id = current_setting('app.user_id', true)::text);

CREATE POLICY "Users can delete their own preferences" ON user_preferences
  FOR DELETE TO public
  USING (user_id = current_setting('app.user_id', true)::text);

-- Permissive policies for service role
CREATE POLICY "user_preferences_select" ON user_preferences
  FOR SELECT TO public USING (true);

CREATE POLICY "user_preferences_insert" ON user_preferences
  FOR INSERT TO public WITH CHECK (true);

CREATE POLICY "user_preferences_update" ON user_preferences
  FOR UPDATE TO public USING (true);

CREATE POLICY "user_preferences_delete" ON user_preferences
  FOR DELETE TO public USING (true);

-- Comment
COMMENT ON TABLE user_preferences IS 'Stores user workspace identity and system preferences';
