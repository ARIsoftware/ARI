-- Tasks module schema
-- Idempotent: safe to run on every module enable.
-- Mirrors modules-core/tasks/database/schema.ts

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  assignees TEXT[] DEFAULT ARRAY['']::TEXT[],
  due_date DATE,
  subtasks_completed INTEGER DEFAULT 0,
  subtasks_total INTEGER DEFAULT 0,
  status TEXT DEFAULT 'Pending',
  priority TEXT DEFAULT 'Medium',
  pinned BOOLEAN DEFAULT FALSE,
  completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  order_index INTEGER DEFAULT 0,
  completion_count INTEGER DEFAULT 0,
  user_email TEXT,
  user_id TEXT NOT NULL,
  impact INTEGER DEFAULT 3,
  severity INTEGER DEFAULT 3,
  timeliness INTEGER DEFAULT 3,
  effort INTEGER DEFAULT 3,
  strategic_fit INTEGER DEFAULT 3,
  priority_score NUMERIC(10, 4) DEFAULT 0,
  project_id UUID,
  monster_type TEXT,
  monster_colors JSONB
);

-- For modules updating from older schemas, make additive changes idempotent:
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS impact INTEGER DEFAULT 3;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS severity INTEGER DEFAULT 3;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS timeliness INTEGER DEFAULT 3;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS effort INTEGER DEFAULT 3;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS strategic_fit INTEGER DEFAULT 3;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS priority_score NUMERIC(10, 4) DEFAULT 0;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS project_id UUID;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS monster_type TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS monster_colors JSONB;

CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_user_id_completed ON tasks(user_id, completed);
CREATE INDEX IF NOT EXISTS idx_ari_database_completed ON tasks(completed);
CREATE INDEX IF NOT EXISTS idx_ari_database_completion_count ON tasks(completion_count);
CREATE INDEX IF NOT EXISTS idx_ari_database_created_at ON tasks(created_at);
CREATE INDEX IF NOT EXISTS idx_ari_database_order ON tasks(order_index);
CREATE INDEX IF NOT EXISTS idx_ari_database_starred ON tasks(pinned);
CREATE INDEX IF NOT EXISTS idx_ari_database_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority_score ON tasks(priority_score);
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_monster_type ON tasks(monster_type);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tasks_rls_select ON tasks;
CREATE POLICY tasks_rls_select ON tasks FOR SELECT
  USING (user_id::text = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS tasks_rls_insert ON tasks;
CREATE POLICY tasks_rls_insert ON tasks FOR INSERT
  WITH CHECK (user_id::text = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS tasks_rls_update ON tasks;
CREATE POLICY tasks_rls_update ON tasks FOR UPDATE
  USING (user_id::text = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS tasks_rls_delete ON tasks;
CREATE POLICY tasks_rls_delete ON tasks FOR DELETE
  USING (user_id::text = (SELECT current_setting('app.current_user_id')));

-- =============================================================================
-- SAMPLE DATA (only inserted on first install when table is empty)
-- =============================================================================

DO $$
DECLARE
  my_user_id TEXT;
  task_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO task_count FROM tasks;
  IF task_count > 0 THEN
    RETURN;
  END IF;

  SELECT id INTO my_user_id FROM public."user" LIMIT 1;

  IF my_user_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO tasks (user_id, title, status, priority, impact, severity, timeliness, effort, strategic_fit, priority_score, order_index)
  VALUES
    (my_user_id, 'Finalize Pitch Deck Draft', 'Pending', 'High', 5, 3, 2, 4, 5, 4.9, 0),
    (my_user_id, 'Build MVP Landing Page', 'Pending', 'High', 5, 4, 3, 4, 5, 6.1, 1),
    (my_user_id, 'Customer Discovery Interviews', 'Pending', 'Low', 3, 2, 1, 5, 2, 1.9, 2);

END $$;
