-- My Prospects Module - Database Schema
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS prospects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  position TEXT NOT NULL,
  graduation_year INTEGER NOT NULL,
  school TEXT NOT NULL DEFAULT '',
  height TEXT NOT NULL DEFAULT '',
  rating INTEGER NOT NULL DEFAULT 3 CHECK (rating >= 1 AND rating <= 5),
  notes TEXT,
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_prospects_user_id ON prospects (user_id);
CREATE INDEX IF NOT EXISTS idx_prospects_graduation_year ON prospects (user_id, graduation_year);
CREATE INDEX IF NOT EXISTS idx_prospects_rating ON prospects (user_id, rating);

-- RLS (permissive policies for Better Auth - app-level enforcement via withRLS)
ALTER TABLE prospects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prospects_select" ON prospects FOR SELECT TO public USING (true);
CREATE POLICY "prospects_insert" ON prospects FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "prospects_update" ON prospects FOR UPDATE TO public USING (true);
CREATE POLICY "prospects_delete" ON prospects FOR DELETE TO public USING (true);
