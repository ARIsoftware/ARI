-- Migration: Add completed column to ari_launch_entries table
-- Purpose: Support marking tasks as completed with visual styling

-- Add the completed column with a default of false
ALTER TABLE ari_launch_entries
ADD COLUMN IF NOT EXISTS completed BOOLEAN DEFAULT FALSE NOT NULL;

-- Create an index for efficient filtering by completed status
CREATE INDEX IF NOT EXISTS idx_ari_launch_entries_completed
ON ari_launch_entries (user_id, completed);
