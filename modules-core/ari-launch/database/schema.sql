-- =============================================================================
-- ARI LAUNCH MODULE - DATABASE SETUP
-- =============================================================================
--
-- INSTRUCTIONS:
-- 1. Copy this entire file
-- 2. Paste into Supabase SQL Editor
-- 3. Click "Run"
-- 4. Go to Table Editor > ari_launch_entries > Enable RLS
--
-- =============================================================================

-- Create the table
CREATE TABLE ari_launch_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  day_number INTEGER NOT NULL CHECK (day_number >= 1 AND day_number <= 45),
  title VARCHAR(500) NOT NULL,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for fast queries
CREATE INDEX idx_ari_launch_entries_user_id ON ari_launch_entries(user_id);
CREATE INDEX idx_ari_launch_entries_user_day ON ari_launch_entries(user_id, day_number);

-- Enable Row Level Security
ALTER TABLE ari_launch_entries ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access their own data
CREATE POLICY "ari_launch_entries_select" ON ari_launch_entries
  FOR SELECT TO public USING (true);

CREATE POLICY "ari_launch_entries_insert" ON ari_launch_entries
  FOR INSERT TO public WITH CHECK (true);

CREATE POLICY "ari_launch_entries_update" ON ari_launch_entries
  FOR UPDATE TO public USING (true);

CREATE POLICY "ari_launch_entries_delete" ON ari_launch_entries
  FOR DELETE TO public USING (true);

-- Auto-update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_ari_launch_entries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ari_launch_entries_updated_at
  BEFORE UPDATE ON ari_launch_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_ari_launch_entries_updated_at();
