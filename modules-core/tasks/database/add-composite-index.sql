-- Adds a composite index on (user_id, completed) to speed up
-- the "last completed task" and per-user completed-task filters.
-- Safe to run multiple times.

CREATE INDEX IF NOT EXISTS idx_tasks_user_id_completed
  ON tasks (user_id, completed);
