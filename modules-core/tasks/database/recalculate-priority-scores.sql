-- Recalculate all task priority scores with normalized distance formula
-- (higher score = higher priority, 0-10 range)
-- Run this once after deploying the code changes.
--
-- CAUTION: This UPDATE has no WHERE clause and rewrites the priority_score
-- and updated_at columns of EVERY row in the tasks table. Confirm you are
-- on the correct database and have a backup before running.

UPDATE tasks
SET priority_score = GREATEST(0, LEAST(10,
  (1.0 - SQRT(
    1.2 * POWER(((COALESCE(impact, 3) - 1)::numeric / 4.0) - 1.0, 2) +
    1.0 * POWER(((COALESCE(severity, 3) - 1)::numeric / 4.0) - 1.0, 2) +
    1.1 * POWER(((COALESCE(timeliness, 3) - 1)::numeric / 4.0) - 1.0, 2) +
    0.8 * POWER((1.0 - ((COALESCE(effort, 3) - 1)::numeric / 4.0)) - 1.0, 2) +
    1.0 * POWER(((COALESCE(strategic_fit, 3) - 1)::numeric / 4.0) - 1.0, 2)
  ) / SQRT(1.2 + 1.0 + 1.1 + 0.8 + 1.0)) * 10.0
)),
updated_at = NOW();
