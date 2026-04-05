-- Drop the legacy user_feature_preferences table
-- This table has been replaced by module_settings which tracks module enabled/disabled state
-- Run this manually in Supabase SQL Editor

DROP TABLE IF EXISTS public.user_feature_preferences;
