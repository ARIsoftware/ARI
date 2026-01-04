-- Migration: Expand ari_launch_entries.title column from varchar(500) to varchar(3000)
-- Date: 2026-01-04
-- Purpose: Allow longer task descriptions in the ARI Launch module

-- Expand the title column to support up to 3000 characters
ALTER TABLE ari_launch_entries
ALTER COLUMN title TYPE varchar(3000);

-- Verify the change
SELECT column_name, data_type, character_maximum_length
FROM information_schema.columns
WHERE table_name = 'ari_launch_entries' AND column_name = 'title';
