-- Mail Stream Module: Add setup_complete column and change default retention
-- Run this migration to add onboarding support

-- Add setup_complete column to mail_stream_settings
ALTER TABLE mail_stream_settings
ADD COLUMN IF NOT EXISTS setup_complete BOOLEAN NOT NULL DEFAULT FALSE;

-- Update default for retention_days to -1 (indefinitely) for new rows
-- Note: This doesn't change the column default in existing DDL, just documents the new behavior
-- The application code will handle the default of -1

-- Optional: Update existing rows to have indefinite retention if desired
-- UPDATE mail_stream_settings SET retention_days = -1 WHERE retention_days = 30;

COMMENT ON COLUMN mail_stream_settings.setup_complete IS 'Whether the user has completed initial setup';
COMMENT ON COLUMN mail_stream_settings.retention_days IS 'Number of days to keep events (-1 = indefinitely)';
