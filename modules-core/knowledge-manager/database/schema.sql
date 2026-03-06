-- =============================================================================
-- KNOWLEDGE MANAGER MODULE - DATABASE SCHEMA
-- =============================================================================
-- Table: knowledge_articles
-- Purpose: Store knowledge articles with tags for user-specific knowledge management
-- =============================================================================

-- Create table
CREATE TABLE IF NOT EXISTS knowledge_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_knowledge_articles_user_id
  ON knowledge_articles(user_id);

CREATE INDEX IF NOT EXISTS idx_knowledge_articles_created_at
  ON knowledge_articles(created_at DESC);

-- GIN index for efficient tag array queries
CREATE INDEX IF NOT EXISTS idx_knowledge_articles_tags
  ON knowledge_articles USING GIN(tags);

-- Enable Row Level Security
ALTER TABLE knowledge_articles ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- RLS POLICIES (All 4 required)
-- =============================================================================

-- SELECT: Users can view their own articles
CREATE POLICY "Users can view their own knowledge_articles"
  ON knowledge_articles FOR SELECT
  USING (auth.uid() = user_id);

-- INSERT: Users can insert their own articles
CREATE POLICY "Users can insert their own knowledge_articles"
  ON knowledge_articles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- UPDATE: Users can update their own articles
CREATE POLICY "Users can update their own knowledge_articles"
  ON knowledge_articles FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- DELETE: Users can delete their own articles
CREATE POLICY "Users can delete their own knowledge_articles"
  ON knowledge_articles FOR DELETE
  USING (auth.uid() = user_id);

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_knowledge_articles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS knowledge_articles_updated_at ON knowledge_articles;
CREATE TRIGGER knowledge_articles_updated_at
  BEFORE UPDATE ON knowledge_articles
  FOR EACH ROW
  EXECUTE FUNCTION update_knowledge_articles_updated_at();

-- =============================================================================
-- VERIFICATION
-- =============================================================================
-- Run these to verify setup:
-- SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'knowledge_articles';
-- SELECT * FROM pg_policies WHERE tablename = 'knowledge_articles';
-- SELECT indexname FROM pg_indexes WHERE tablename = 'knowledge_articles';
