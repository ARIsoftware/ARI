-- =============================================================================
-- DOCUMENTS MODULE DATABASE SCHEMA
-- =============================================================================
-- Version: 1.0.0
-- Tables: documents, document_folders, document_tags, document_tag_assignments
--
-- NOTE: User isolation is enforced at the application level via withRLS(),
-- not via database RLS policies. Better Auth doesn't use auth.uid().
-- =============================================================================

-- =============================================================================
-- TABLE: document_folders
-- Purpose: Hierarchical folder structure for organizing documents
-- =============================================================================

CREATE TABLE IF NOT EXISTS document_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,                          -- Better Auth user ID
  name VARCHAR(255) NOT NULL,                     -- Folder display name
  parent_id UUID REFERENCES document_folders(id) ON DELETE CASCADE,  -- Parent folder (NULL = root)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL  -- Soft delete for trash
);

-- Indexes for document_folders
CREATE INDEX IF NOT EXISTS idx_document_folders_user_id
  ON document_folders(user_id);
CREATE INDEX IF NOT EXISTS idx_document_folders_parent_id
  ON document_folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_document_folders_deleted_at
  ON document_folders(deleted_at);

-- =============================================================================
-- TABLE: documents
-- Purpose: File metadata storage (actual files in cloud storage)
-- =============================================================================

CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,                          -- Better Auth user ID
  name VARCHAR(255) NOT NULL,                     -- Display name (can be renamed)
  original_name VARCHAR(255) NOT NULL,            -- Original uploaded filename
  storage_provider VARCHAR(20) NOT NULL,          -- 'supabase', 'r2', or 's3'
  storage_path TEXT NOT NULL,                     -- Path in storage bucket
  size_bytes BIGINT NOT NULL,                     -- File size in bytes
  mime_type VARCHAR(255) NOT NULL,                -- MIME type (e.g., 'image/png')
  folder_id UUID REFERENCES document_folders(id) ON DELETE SET NULL,  -- Parent folder
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL  -- Soft delete for trash
);

-- Indexes for documents
CREATE INDEX IF NOT EXISTS idx_documents_user_id
  ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_folder_id
  ON documents(folder_id);
CREATE INDEX IF NOT EXISTS idx_documents_deleted_at
  ON documents(deleted_at);
CREATE INDEX IF NOT EXISTS idx_documents_created_at
  ON documents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_mime_type
  ON documents(mime_type);
CREATE INDEX IF NOT EXISTS idx_documents_name_search
  ON documents USING gin(to_tsvector('english', name));

-- =============================================================================
-- TABLE: document_tags
-- Purpose: User-defined tags for categorizing documents
-- =============================================================================

CREATE TABLE IF NOT EXISTS document_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,                          -- Better Auth user ID
  name VARCHAR(100) NOT NULL,                     -- Tag display name
  color VARCHAR(7) NOT NULL DEFAULT '#3b82f6',    -- Hex color code
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Ensure unique tag names per user
  CONSTRAINT unique_tag_name_per_user UNIQUE (user_id, name)
);

-- Indexes for document_tags
CREATE INDEX IF NOT EXISTS idx_document_tags_user_id
  ON document_tags(user_id);

-- =============================================================================
-- TABLE: document_tag_assignments
-- Purpose: Many-to-many relationship between documents and tags
-- =============================================================================

CREATE TABLE IF NOT EXISTS document_tag_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES document_tags(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Prevent duplicate assignments
  CONSTRAINT unique_document_tag UNIQUE (document_id, tag_id)
);

-- Indexes for document_tag_assignments
CREATE INDEX IF NOT EXISTS idx_document_tag_assignments_document_id
  ON document_tag_assignments(document_id);
CREATE INDEX IF NOT EXISTS idx_document_tag_assignments_tag_id
  ON document_tag_assignments(tag_id);

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Auto-update updated_at for documents
CREATE OR REPLACE FUNCTION update_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS documents_updated_at ON documents;
CREATE TRIGGER documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW
  EXECUTE FUNCTION update_documents_updated_at();

-- Auto-update updated_at for document_folders
CREATE OR REPLACE FUNCTION update_document_folders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS document_folders_updated_at ON document_folders;
CREATE TRIGGER document_folders_updated_at
  BEFORE UPDATE ON document_folders
  FOR EACH ROW
  EXECUTE FUNCTION update_document_folders_updated_at();

-- =============================================================================
-- VERIFICATION QUERIES
-- =============================================================================
-- Run these to verify tables were created:
--
-- SELECT tablename FROM pg_tables WHERE tablename LIKE 'document%';
--
-- SELECT
--   table_name,
--   column_name,
--   data_type
-- FROM information_schema.columns
-- WHERE table_name IN ('documents', 'document_folders', 'document_tags', 'document_tag_assignments')
-- ORDER BY table_name, ordinal_position;
-- =============================================================================
