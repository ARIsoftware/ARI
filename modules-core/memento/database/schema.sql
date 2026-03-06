-- =============================================================================
-- MEMENTO MODULE DATABASE SCHEMA
-- =============================================================================
-- Module: Memento (Life Grid Visualization)
-- Version: 1.0.0
-- Description: Stores user settings, milestones, and life eras for the
--              Memento life visualization module.
-- =============================================================================

-- =============================================================================
-- TABLE: memento_settings
-- Purpose: Store user-specific settings (birthdate, target lifespan)
-- =============================================================================

CREATE TABLE IF NOT EXISTS memento_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  birthdate DATE NOT NULL,                           -- User's birthdate
  target_lifespan INTEGER NOT NULL DEFAULT 80,       -- Target lifespan in years
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- One settings row per user
  CONSTRAINT memento_settings_user_unique UNIQUE (user_id),

  -- Validate lifespan is reasonable
  CONSTRAINT memento_settings_lifespan_check CHECK (target_lifespan >= 50 AND target_lifespan <= 120)
);

-- Index for user lookup
CREATE INDEX IF NOT EXISTS idx_memento_settings_user_id
  ON memento_settings(user_id);

-- Enable RLS
ALTER TABLE memento_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for memento_settings
CREATE POLICY "Users can view their own memento settings"
  ON memento_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own memento settings"
  ON memento_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own memento settings"
  ON memento_settings FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own memento settings"
  ON memento_settings FOR DELETE
  USING (auth.uid() = user_id);

-- Service role policies (for withRLS to work)
CREATE POLICY "memento_settings_select"
  ON memento_settings FOR SELECT TO public;

CREATE POLICY "memento_settings_insert"
  ON memento_settings FOR INSERT TO public;

CREATE POLICY "memento_settings_update"
  ON memento_settings FOR UPDATE TO public;

CREATE POLICY "memento_settings_delete"
  ON memento_settings FOR DELETE TO public;

-- =============================================================================
-- TABLE: memento_milestones
-- Purpose: Store milestones/memories for specific weeks
-- =============================================================================

CREATE TABLE IF NOT EXISTS memento_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  week_number INTEGER NOT NULL,                      -- Week number from birth (0-indexed)
  title VARCHAR(255) NOT NULL,                       -- Milestone title
  description TEXT,                                  -- Optional longer description
  category VARCHAR(50),                              -- Optional category
  mood INTEGER,                                      -- Optional mood rating 1-5
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- One milestone per week per user
  CONSTRAINT memento_milestones_user_week_unique UNIQUE (user_id, week_number),

  -- Validate week number is non-negative
  CONSTRAINT memento_milestones_week_check CHECK (week_number >= 0),

  -- Validate mood is 1-5 if provided
  CONSTRAINT memento_milestones_mood_check CHECK (mood IS NULL OR (mood >= 1 AND mood <= 5))
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_memento_milestones_user_id
  ON memento_milestones(user_id);

CREATE INDEX IF NOT EXISTS idx_memento_milestones_user_week
  ON memento_milestones(user_id, week_number);

CREATE INDEX IF NOT EXISTS idx_memento_milestones_category
  ON memento_milestones(category);

-- Enable RLS
ALTER TABLE memento_milestones ENABLE ROW LEVEL SECURITY;

-- RLS Policies for memento_milestones
CREATE POLICY "Users can view their own memento milestones"
  ON memento_milestones FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own memento milestones"
  ON memento_milestones FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own memento milestones"
  ON memento_milestones FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own memento milestones"
  ON memento_milestones FOR DELETE
  USING (auth.uid() = user_id);

-- Service role policies
CREATE POLICY "memento_milestones_select"
  ON memento_milestones FOR SELECT TO public;

CREATE POLICY "memento_milestones_insert"
  ON memento_milestones FOR INSERT TO public;

CREATE POLICY "memento_milestones_update"
  ON memento_milestones FOR UPDATE TO public;

CREATE POLICY "memento_milestones_delete"
  ON memento_milestones FOR DELETE TO public;

-- =============================================================================
-- TABLE: memento_eras
-- Purpose: Store life eras with date ranges and colors
-- =============================================================================

CREATE TABLE IF NOT EXISTS memento_eras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name VARCHAR(100) NOT NULL,                        -- Era name
  start_date DATE NOT NULL,                          -- Era start date
  end_date DATE NOT NULL,                            -- Era end date
  color VARCHAR(20) NOT NULL DEFAULT '#6b7280',      -- Hex color code
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Validate end_date is after start_date
  CONSTRAINT memento_eras_dates_check CHECK (end_date >= start_date)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_memento_eras_user_id
  ON memento_eras(user_id);

CREATE INDEX IF NOT EXISTS idx_memento_eras_dates
  ON memento_eras(user_id, start_date, end_date);

-- Enable RLS
ALTER TABLE memento_eras ENABLE ROW LEVEL SECURITY;

-- RLS Policies for memento_eras
CREATE POLICY "Users can view their own memento eras"
  ON memento_eras FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own memento eras"
  ON memento_eras FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own memento eras"
  ON memento_eras FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own memento eras"
  ON memento_eras FOR DELETE
  USING (auth.uid() = user_id);

-- Service role policies
CREATE POLICY "memento_eras_select"
  ON memento_eras FOR SELECT TO public;

CREATE POLICY "memento_eras_insert"
  ON memento_eras FOR INSERT TO public;

CREATE POLICY "memento_eras_update"
  ON memento_eras FOR UPDATE TO public;

CREATE POLICY "memento_eras_delete"
  ON memento_eras FOR DELETE TO public;

-- =============================================================================
-- TRIGGERS: Auto-update updated_at timestamp
-- =============================================================================

-- Function to update updated_at
CREATE OR REPLACE FUNCTION update_memento_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for memento_settings
DROP TRIGGER IF EXISTS memento_settings_updated_at ON memento_settings;
CREATE TRIGGER memento_settings_updated_at
  BEFORE UPDATE ON memento_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_memento_updated_at();

-- Trigger for memento_milestones
DROP TRIGGER IF EXISTS memento_milestones_updated_at ON memento_milestones;
CREATE TRIGGER memento_milestones_updated_at
  BEFORE UPDATE ON memento_milestones
  FOR EACH ROW
  EXECUTE FUNCTION update_memento_updated_at();

-- Trigger for memento_eras
DROP TRIGGER IF EXISTS memento_eras_updated_at ON memento_eras;
CREATE TRIGGER memento_eras_updated_at
  BEFORE UPDATE ON memento_eras
  FOR EACH ROW
  EXECUTE FUNCTION update_memento_updated_at();

-- =============================================================================
-- VERIFICATION QUERIES
-- =============================================================================
-- Run these to verify setup:
--
-- Check tables exist:
-- SELECT tablename FROM pg_tables WHERE tablename LIKE 'memento_%';
--
-- Check RLS is enabled:
-- SELECT tablename, rowsecurity FROM pg_tables WHERE tablename LIKE 'memento_%';
--
-- Check policies:
-- SELECT * FROM pg_policies WHERE tablename LIKE 'memento_%';
-- =============================================================================
