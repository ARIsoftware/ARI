-- Tasks module schema
-- Idempotent: safe to run on every module enable.
-- Mirrors modules-core/tasks/database/schema.ts

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  assignees TEXT[] DEFAULT '{}'::TEXT[],
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
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assigned_agent_id TEXT;

-- Older installs ran CREATE TABLE with no default (or DEFAULT ARRAY['']::TEXT[]),
-- leaving rows with NULL or the [""] sentinel that fail array validation on edit.
-- CREATE TABLE IF NOT EXISTS skips on those installs, so fix the default and rows here.
ALTER TABLE tasks ALTER COLUMN assignees SET DEFAULT '{}'::TEXT[];
UPDATE tasks SET assignees = '{}'::TEXT[]
  WHERE assignees IS NULL OR assignees = ARRAY['']::TEXT[];

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
CREATE INDEX IF NOT EXISTS idx_tasks_user_id_updated_at ON tasks(user_id, updated_at DESC);

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
-- SUBTASKS
-- Real checklist items per task. The tasks.subtasks_completed/subtasks_total
-- counters are kept in sync by the subtasks API on every mutation.
-- =============================================================================

CREATE TABLE IF NOT EXISTS task_subtasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Installs that created the table before NOT NULL was added: backfill any
-- NULLs (only possible via out-of-band inserts), then enforce the constraint
-- the app relies on (sorting by order_index/created_at, boolean checkboxes).
UPDATE task_subtasks SET completed = FALSE WHERE completed IS NULL;
UPDATE task_subtasks SET order_index = 0 WHERE order_index IS NULL;
UPDATE task_subtasks SET created_at = NOW() WHERE created_at IS NULL;
UPDATE task_subtasks SET updated_at = NOW() WHERE updated_at IS NULL;
ALTER TABLE task_subtasks ALTER COLUMN completed SET NOT NULL;
ALTER TABLE task_subtasks ALTER COLUMN order_index SET NOT NULL;
ALTER TABLE task_subtasks ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE task_subtasks ALTER COLUMN updated_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_task_subtasks_task_id ON task_subtasks(task_id);
CREATE INDEX IF NOT EXISTS idx_task_subtasks_user_id ON task_subtasks(user_id);
CREATE INDEX IF NOT EXISTS idx_task_subtasks_user_task ON task_subtasks(user_id, task_id);

ALTER TABLE task_subtasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS task_subtasks_rls_select ON task_subtasks;
CREATE POLICY task_subtasks_rls_select ON task_subtasks FOR SELECT
  USING (user_id::text = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS task_subtasks_rls_insert ON task_subtasks;
CREATE POLICY task_subtasks_rls_insert ON task_subtasks FOR INSERT
  WITH CHECK (user_id::text = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS task_subtasks_rls_update ON task_subtasks;
CREATE POLICY task_subtasks_rls_update ON task_subtasks FOR UPDATE
  USING (user_id::text = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS task_subtasks_rls_delete ON task_subtasks;
CREATE POLICY task_subtasks_rls_delete ON task_subtasks FOR DELETE
  USING (user_id::text = (SELECT current_setting('app.current_user_id')));

-- Reconcile the derived counters with the real subtask rows. Tasks created
-- before subtasks were rows stored a hand-entered numeric counter; the API no
-- longer accepts client counter values, so clear/recompute them here.
-- Idempotent: re-running only touches rows that are out of sync.
UPDATE tasks SET subtasks_total = 0, subtasks_completed = 0
WHERE (subtasks_total IS DISTINCT FROM 0 OR subtasks_completed IS DISTINCT FROM 0)
  AND id NOT IN (SELECT task_id FROM task_subtasks);

UPDATE tasks t SET subtasks_total = c.total, subtasks_completed = c.completed
FROM (
  SELECT task_id, count(*)::int AS total, (count(*) FILTER (WHERE completed))::int AS completed
  FROM task_subtasks
  GROUP BY task_id
) c
WHERE c.task_id = t.id
  AND (t.subtasks_total IS DISTINCT FROM c.total OR t.subtasks_completed IS DISTINCT FROM c.completed);

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

  INSERT INTO tasks (user_id, title, assignees, status, priority, impact, severity, timeliness, effort, strategic_fit, priority_score, order_index)
  VALUES
    (my_user_id, 'Finalize Pitch Deck Draft', '{}'::TEXT[], 'Pending', 'High', 5, 3, 2, 4, 5, 4.9, 0),
    (my_user_id, 'Build MVP Landing Page', '{}'::TEXT[], 'Pending', 'High', 5, 4, 3, 4, 5, 6.1, 1),
    (my_user_id, 'Customer Discovery Interviews', '{}'::TEXT[], 'Pending', 'Low', 3, 2, 1, 5, 2, 1.9, 2);

END $$;
