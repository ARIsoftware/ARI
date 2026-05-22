-- =============================================================================
-- DOCUMENTS MODULE DATABASE SCHEMA
-- =============================================================================
-- Version: 1.2.0
-- Tables: documents, document_folders, document_tags, document_tag_assignments
--
-- User isolation: enforced by Postgres RLS policies (see end of file) that
-- read the per-transaction GUC `app.current_user_id` set by lib/db/index.ts
-- withRLS()/withUserContext(). Better Auth user ids are TEXT, not auth.uid().
-- Idempotent: safe to re-run on every module enable.
-- =============================================================================

-- =============================================================================
-- TABLE: document_folders
-- Purpose: Hierarchical folder structure for organizing documents
-- =============================================================================

CREATE TABLE IF NOT EXISTS document_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,                              -- Better Auth user ID
  name TEXT NOT NULL,                                 -- Folder display name (length capped in app layer)
  parent_id UUID REFERENCES document_folders(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL    -- Soft delete for trash
);

-- Upgrade existing installs from VARCHAR → TEXT (no-op when already TEXT).
ALTER TABLE document_folders ALTER COLUMN name TYPE TEXT;

-- Indexes for document_folders
CREATE INDEX IF NOT EXISTS idx_document_folders_user_id
  ON document_folders(user_id);
CREATE INDEX IF NOT EXISTS idx_document_folders_parent_id
  ON document_folders(parent_id);
-- Composite partial index for the hot list path: live folders under a parent for a given user
CREATE INDEX IF NOT EXISTS idx_document_folders_user_parent
  ON document_folders(user_id, parent_id)
  WHERE deleted_at IS NULL;
-- Partial index for the trash view (small subset of all rows)
CREATE INDEX IF NOT EXISTS idx_document_folders_trash
  ON document_folders(user_id, deleted_at DESC)
  WHERE deleted_at IS NOT NULL;
-- (Unconditional idx_document_folders_deleted_at intentionally not (re-)created;
--  the partial trash index above serves the trash query.)

-- =============================================================================
-- TABLE: documents
-- Purpose: File metadata storage (actual files in cloud storage)
-- =============================================================================

CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,                              -- Better Auth user ID
  name TEXT NOT NULL,                                 -- Display name (can be renamed)
  original_name TEXT NOT NULL,                        -- Original uploaded filename
  storage_provider TEXT NOT NULL
    CHECK (storage_provider IN ('supabase', 'r2', 's3', 'local')),
  storage_path TEXT NOT NULL,                         -- Path in storage bucket
  storage_bucket TEXT,                                -- Bucket the file lives in (recorded at upload time)
  size_bytes BIGINT NOT NULL,                         -- File size in bytes
  mime_type TEXT NOT NULL,                            -- MIME type
  folder_id UUID REFERENCES document_folders(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL    -- Soft delete for trash
);

-- Upgrade existing installs from VARCHAR → TEXT (no-op when already TEXT).
ALTER TABLE documents ALTER COLUMN name TYPE TEXT;
ALTER TABLE documents ALTER COLUMN original_name TYPE TEXT;
ALTER TABLE documents ALTER COLUMN storage_provider TYPE TEXT;
ALTER TABLE documents ALTER COLUMN mime_type TYPE TEXT;

-- Add storage_bucket for installs that predate it. Older rows have NULL and
-- the code falls back to current env / settings for those.
ALTER TABLE documents ADD COLUMN IF NOT EXISTS storage_bucket TEXT;

-- Extend the storage_provider CHECK constraint to allow 'local' (filesystem).
-- Idempotent: drop the old constraint if present (under either common name)
-- then add the expanded one.
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_storage_provider_check;
ALTER TABLE documents ADD CONSTRAINT documents_storage_provider_check
  CHECK (storage_provider IN ('supabase', 'r2', 's3', 'local'));

-- Indexes for documents (mime_type and unconditional deleted_at indexes
-- intentionally not (re-)created; existing installs keep them as legacy.)
CREATE INDEX IF NOT EXISTS idx_documents_user_id
  ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_folder_id
  ON documents(folder_id);
CREATE INDEX IF NOT EXISTS idx_documents_created_at
  ON documents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_name_search
  ON documents USING gin(to_tsvector('english', name));
-- Composite partial index for the hot list path: live docs by user, optionally
-- by folder, ordered by recency.
CREATE INDEX IF NOT EXISTS idx_documents_user_folder_created
  ON documents(user_id, folder_id, created_at DESC)
  WHERE deleted_at IS NULL;
-- Partial index for the trash view
CREATE INDEX IF NOT EXISTS idx_documents_trash
  ON documents(user_id, deleted_at DESC)
  WHERE deleted_at IS NOT NULL;

-- =============================================================================
-- TABLE: document_tags
-- Purpose: User-defined tags for categorizing documents
-- =============================================================================

CREATE TABLE IF NOT EXISTS document_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,                              -- Better Auth user ID
  name TEXT NOT NULL,                                 -- Tag display name
  color TEXT NOT NULL DEFAULT '#3b82f6'
    CHECK (color ~ '^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$'),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT unique_tag_name_per_user UNIQUE (user_id, name)
);

-- Upgrades for existing installs (no-ops on fresh installs):
ALTER TABLE document_tags ALTER COLUMN name TYPE TEXT;
ALTER TABLE document_tags ALTER COLUMN color TYPE TEXT;
ALTER TABLE document_tags ADD COLUMN IF NOT EXISTS updated_at
  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();
-- Add the color check constraint idempotently (won't double-add).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'document_tags_color_check'
      AND conrelid = 'document_tags'::regclass
  ) THEN
    ALTER TABLE document_tags
      ADD CONSTRAINT document_tags_color_check
      CHECK (color ~ '^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$');
  END IF;
END $$;

-- Indexes for document_tags
CREATE INDEX IF NOT EXISTS idx_document_tags_user_id
  ON document_tags(user_id);

-- =============================================================================
-- TABLE: document_tag_assignments
-- Purpose: Many-to-many relationship between documents and tags
-- Note: user_id is denormalized from the parent documents row so RLS becomes
-- a direct equality check (faster than the EXISTS subquery used previously).
-- =============================================================================

CREATE TABLE IF NOT EXISTS document_tag_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,                              -- Better Auth user ID (denormalized)
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES document_tags(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT unique_document_tag UNIQUE (document_id, tag_id)
);

-- Backfill flow for existing installs (idempotent on re-run):
-- 1. Add user_id as nullable so existing rows aren't rejected mid-migration.
ALTER TABLE document_tag_assignments
  ADD COLUMN IF NOT EXISTS user_id TEXT;
-- 2. Backfill from the parent documents row.
UPDATE document_tag_assignments dta
   SET user_id = d.user_id
  FROM documents d
 WHERE dta.document_id = d.id
   AND dta.user_id IS NULL;
-- 3. Promote to NOT NULL once every row is populated. Guarded so a partial
--    backfill state (extremely unlikely but possible if interrupted) doesn't
--    cause schema.sql to fail on re-enable.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM document_tag_assignments WHERE user_id IS NULL) THEN
    ALTER TABLE document_tag_assignments ALTER COLUMN user_id SET NOT NULL;
  END IF;
END $$;
-- 4. Add updated_at if missing.
ALTER TABLE document_tag_assignments
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();

-- Indexes for document_tag_assignments
CREATE INDEX IF NOT EXISTS idx_document_tag_assignments_document_id
  ON document_tag_assignments(document_id);
CREATE INDEX IF NOT EXISTS idx_document_tag_assignments_tag_id
  ON document_tag_assignments(tag_id);
CREATE INDEX IF NOT EXISTS idx_document_tag_assignments_user_id
  ON document_tag_assignments(user_id);

-- =============================================================================
-- FOREIGN KEYS TO BETTER AUTH user TABLE
-- =============================================================================
-- Wire denormalized user_id columns into the Better Auth user table so user
-- deletion cascades to module rows. NOT VALID skips validation of existing
-- rows — installs with stale data won't fail to re-enable, but new writes
-- still hit the constraint and ON DELETE CASCADE still fires. Operators can
-- run ALTER TABLE ... VALIDATE CONSTRAINT later if they want full enforcement.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'document_folders_user_id_fkey'
      AND conrelid = 'document_folders'::regclass
  ) THEN
    ALTER TABLE document_folders
      ADD CONSTRAINT document_folders_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE
      NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'documents_user_id_fkey'
      AND conrelid = 'documents'::regclass
  ) THEN
    ALTER TABLE documents
      ADD CONSTRAINT documents_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE
      NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'document_tags_user_id_fkey'
      AND conrelid = 'document_tags'::regclass
  ) THEN
    ALTER TABLE document_tags
      ADD CONSTRAINT document_tags_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE
      NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'document_tag_assignments_user_id_fkey'
      AND conrelid = 'document_tag_assignments'::regclass
  ) THEN
    ALTER TABLE document_tag_assignments
      ADD CONSTRAINT document_tag_assignments_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE
      NOT VALID;
  END IF;
END $$;

-- Best-effort promotion to fully VALIDATED. VALIDATE is a no-op on an already-
-- validated constraint, so this is idempotent. If pre-existing orphan rows make
-- VALIDATE fail, swallow the error so module re-enable still succeeds; an
-- operator can clean up the orphans and re-run schema.sql to validate later.
DO $$ BEGIN
  ALTER TABLE document_folders         VALIDATE CONSTRAINT document_folders_user_id_fkey;
EXCEPTION WHEN foreign_key_violation THEN
  RAISE NOTICE 'document_folders_user_id_fkey: orphan rows present, leaving NOT VALID';
END $$;

DO $$ BEGIN
  ALTER TABLE documents                VALIDATE CONSTRAINT documents_user_id_fkey;
EXCEPTION WHEN foreign_key_violation THEN
  RAISE NOTICE 'documents_user_id_fkey: orphan rows present, leaving NOT VALID';
END $$;

DO $$ BEGIN
  ALTER TABLE document_tags            VALIDATE CONSTRAINT document_tags_user_id_fkey;
EXCEPTION WHEN foreign_key_violation THEN
  RAISE NOTICE 'document_tags_user_id_fkey: orphan rows present, leaving NOT VALID';
END $$;

DO $$ BEGIN
  ALTER TABLE document_tag_assignments VALIDATE CONSTRAINT document_tag_assignments_user_id_fkey;
EXCEPTION WHEN foreign_key_violation THEN
  RAISE NOTICE 'document_tag_assignments_user_id_fkey: orphan rows present, leaving NOT VALID';
END $$;

-- =============================================================================
-- COMPOSITE FK: enforce denormalized user_id parity on tag assignments
-- =============================================================================
-- document_tag_assignments.user_id is denormalized from the parent rows.
-- Composite FKs make the pair (document_id, user_id) and (tag_id, user_id)
-- bypass-proof at the catalog level — a forged INSERT with self.user_id but
-- another user's document_id (or tag_id) fails with a FK violation. RLS stays
-- a direct-equality check (no EXISTS subquery, no perf regression).

-- 1. Unique constraints on the parent (id, user_id) pairs. Required by
--    Postgres as the target of a composite FK; id is already unique on its
--    own, so this adds no extra row-level restriction.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'documents_id_user_id_key'
      AND conrelid = 'documents'::regclass
  ) THEN
    ALTER TABLE documents
      ADD CONSTRAINT documents_id_user_id_key UNIQUE (id, user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'document_tags_id_user_id_key'
      AND conrelid = 'document_tags'::regclass
  ) THEN
    ALTER TABLE document_tags
      ADD CONSTRAINT document_tags_id_user_id_key UNIQUE (id, user_id);
  END IF;
END $$;

-- 2. Drop the single-column FKs on document_tag_assignments — the composite
--    FKs below supersede them (cascade still fires because the composite FK
--    targets the parent row).
ALTER TABLE document_tag_assignments
  DROP CONSTRAINT IF EXISTS document_tag_assignments_document_id_fkey;
ALTER TABLE document_tag_assignments
  DROP CONSTRAINT IF EXISTS document_tag_assignments_tag_id_fkey;

-- 3. Add composite FKs.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'document_tag_assignments_document_user_fkey'
      AND conrelid = 'document_tag_assignments'::regclass
  ) THEN
    ALTER TABLE document_tag_assignments
      ADD CONSTRAINT document_tag_assignments_document_user_fkey
      FOREIGN KEY (document_id, user_id)
      REFERENCES documents (id, user_id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'document_tag_assignments_tag_user_fkey'
      AND conrelid = 'document_tag_assignments'::regclass
  ) THEN
    ALTER TABLE document_tag_assignments
      ADD CONSTRAINT document_tag_assignments_tag_user_fkey
      FOREIGN KEY (tag_id, user_id)
      REFERENCES document_tags (id, user_id) ON DELETE CASCADE;
  END IF;
END $$;

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

-- Auto-update updated_at for document_tags
CREATE OR REPLACE FUNCTION update_document_tags_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS document_tags_updated_at ON document_tags;
CREATE TRIGGER document_tags_updated_at
  BEFORE UPDATE ON document_tags
  FOR EACH ROW
  EXECUTE FUNCTION update_document_tags_updated_at();

-- Auto-update updated_at for document_tag_assignments
CREATE OR REPLACE FUNCTION update_document_tag_assignments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS document_tag_assignments_updated_at ON document_tag_assignments;
CREATE TRIGGER document_tag_assignments_updated_at
  BEFORE UPDATE ON document_tag_assignments
  FOR EACH ROW
  EXECUTE FUNCTION update_document_tag_assignments_updated_at();

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================
-- Policies read `app.current_user_id` set by withUserContext() in lib/db/index.ts.
-- Wrapping the GUC in (SELECT ...) lets Postgres cache the value per query.

-- document_folders
ALTER TABLE document_folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS document_folders_rls_select ON document_folders;
CREATE POLICY document_folders_rls_select ON document_folders FOR SELECT
  USING (user_id = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS document_folders_rls_insert ON document_folders;
CREATE POLICY document_folders_rls_insert ON document_folders FOR INSERT
  WITH CHECK (user_id = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS document_folders_rls_update ON document_folders;
CREATE POLICY document_folders_rls_update ON document_folders FOR UPDATE
  USING (user_id = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS document_folders_rls_delete ON document_folders;
CREATE POLICY document_folders_rls_delete ON document_folders FOR DELETE
  USING (user_id = (SELECT current_setting('app.current_user_id')));

-- documents
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS documents_rls_select ON documents;
CREATE POLICY documents_rls_select ON documents FOR SELECT
  USING (user_id = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS documents_rls_insert ON documents;
CREATE POLICY documents_rls_insert ON documents FOR INSERT
  WITH CHECK (user_id = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS documents_rls_update ON documents;
CREATE POLICY documents_rls_update ON documents FOR UPDATE
  USING (user_id = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS documents_rls_delete ON documents;
CREATE POLICY documents_rls_delete ON documents FOR DELETE
  USING (user_id = (SELECT current_setting('app.current_user_id')));

-- document_tags
ALTER TABLE document_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS document_tags_rls_select ON document_tags;
CREATE POLICY document_tags_rls_select ON document_tags FOR SELECT
  USING (user_id = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS document_tags_rls_insert ON document_tags;
CREATE POLICY document_tags_rls_insert ON document_tags FOR INSERT
  WITH CHECK (user_id = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS document_tags_rls_update ON document_tags;
CREATE POLICY document_tags_rls_update ON document_tags FOR UPDATE
  USING (user_id = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS document_tags_rls_delete ON document_tags;
CREATE POLICY document_tags_rls_delete ON document_tags FOR DELETE
  USING (user_id = (SELECT current_setting('app.current_user_id')));

-- document_tag_assignments — direct user_id check (post-denormalization).
ALTER TABLE document_tag_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS document_tag_assignments_rls_select ON document_tag_assignments;
CREATE POLICY document_tag_assignments_rls_select ON document_tag_assignments FOR SELECT
  USING (user_id = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS document_tag_assignments_rls_insert ON document_tag_assignments;
CREATE POLICY document_tag_assignments_rls_insert ON document_tag_assignments FOR INSERT
  WITH CHECK (user_id = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS document_tag_assignments_rls_update ON document_tag_assignments;
CREATE POLICY document_tag_assignments_rls_update ON document_tag_assignments FOR UPDATE
  USING (user_id = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS document_tag_assignments_rls_delete ON document_tag_assignments;
CREATE POLICY document_tag_assignments_rls_delete ON document_tag_assignments FOR DELETE
  USING (user_id = (SELECT current_setting('app.current_user_id')));

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
