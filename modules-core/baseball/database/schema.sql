-- Baseball Module Database Schema
-- Run this in Supabase SQL Editor

-- Teams table
CREATE TABLE IF NOT EXISTS baseball_teams (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  league TEXT NOT NULL CHECK (league IN ('AL', 'NL')),
  division TEXT NOT NULL CHECK (division IN ('East', 'Central', 'West')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_baseball_teams_user_id ON baseball_teams (user_id);

-- Enable RLS
ALTER TABLE baseball_teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "baseball_teams_select" ON baseball_teams FOR SELECT TO public USING (true);
CREATE POLICY "baseball_teams_insert" ON baseball_teams FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "baseball_teams_update" ON baseball_teams FOR UPDATE TO public USING (true);
CREATE POLICY "baseball_teams_delete" ON baseball_teams FOR DELETE TO public USING (true);

-- Players table
CREATE TABLE IF NOT EXISTS baseball_players (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  team_id UUID REFERENCES baseball_teams(id) ON DELETE SET NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  position TEXT NOT NULL CHECK (position IN ('C', 'P', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH', 'OF', 'IF', 'UT')),
  jersey_number INTEGER CHECK (jersey_number >= 0 AND jersey_number <= 99),
  games INTEGER NOT NULL DEFAULT 0,
  at_bats INTEGER NOT NULL DEFAULT 0,
  hits INTEGER NOT NULL DEFAULT 0,
  home_runs INTEGER NOT NULL DEFAULT 0,
  rbi INTEGER NOT NULL DEFAULT 0,
  batting_avg NUMERIC(4,3) NOT NULL DEFAULT 0,
  obp NUMERIC(4,3) NOT NULL DEFAULT 0,
  slg NUMERIC(4,3) NOT NULL DEFAULT 0,
  ops NUMERIC(4,3) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_baseball_players_user_id ON baseball_players (user_id);
CREATE INDEX IF NOT EXISTS idx_baseball_players_team_id ON baseball_players (team_id);

-- Enable RLS
ALTER TABLE baseball_players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "baseball_players_select" ON baseball_players FOR SELECT TO public USING (true);
CREATE POLICY "baseball_players_insert" ON baseball_players FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "baseball_players_update" ON baseball_players FOR UPDATE TO public USING (true);
CREATE POLICY "baseball_players_delete" ON baseball_players FOR DELETE TO public USING (true);
