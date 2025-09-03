# Task Priority Feature - Database Migration Instructions

## Overview
This document contains the SQL migration needed to add priority axes to your tasks table for the new radar chart priority visualization feature.

## Migration Steps

1. **Open Supabase Dashboard**
   - Go to your Supabase project dashboard
   - Navigate to the SQL Editor

2. **Run the Following SQL Migration:**

```sql
-- Add priority axis columns to the tasks table
ALTER TABLE tasks 
ADD COLUMN IF NOT EXISTS impact INTEGER DEFAULT 3 CHECK (impact >= 1 AND impact <= 5),
ADD COLUMN IF NOT EXISTS severity INTEGER DEFAULT 3 CHECK (severity >= 1 AND severity <= 5),
ADD COLUMN IF NOT EXISTS timeliness INTEGER DEFAULT 3 CHECK (timeliness >= 1 AND timeliness <= 5),
ADD COLUMN IF NOT EXISTS effort INTEGER DEFAULT 3 CHECK (effort >= 1 AND effort <= 5),
ADD COLUMN IF NOT EXISTS strategic_fit INTEGER DEFAULT 3 CHECK (strategic_fit >= 1 AND strategic_fit <= 5),
ADD COLUMN IF NOT EXISTS priority_score DECIMAL(10, 4) DEFAULT 0;

-- Create an index on priority_score for faster sorting
CREATE INDEX IF NOT EXISTS idx_tasks_priority_score ON tasks(priority_score);

-- Update existing tasks with default values and calculate initial scores
UPDATE tasks 
SET 
    impact = COALESCE(impact, 3),
    severity = COALESCE(severity, 3),
    timeliness = COALESCE(timeliness, 3),
    effort = COALESCE(effort, 3),
    strategic_fit = COALESCE(strategic_fit, 3),
    priority_score = SQRT(
        POWER((impact::DECIMAL / 5) - 1, 2) +
        POWER((severity::DECIMAL / 5) - 1, 2) +
        POWER((timeliness::DECIMAL / 5) - 1, 2) +
        POWER(1 - (effort::DECIMAL / 5), 2) +  -- Inverted: lower effort is better
        POWER((strategic_fit::DECIMAL / 5) - 1, 2)
    )
WHERE priority_score IS NULL OR priority_score = 0;
```

3. **Verify the Migration**
   - After running the migration, you can verify it worked by running:
   ```sql
   SELECT column_name, data_type 
   FROM information_schema.columns 
   WHERE table_name = 'tasks' 
   AND column_name IN ('impact', 'severity', 'timeliness', 'effort', 'strategic_fit', 'priority_score');
   ```

4. **Test the Feature**
   - Navigate to https://ari.noameppel.com/radar
   - The page should now display your tasks on a radar chart
   - Click on any task to edit its priority factors

## What's New

### New Columns Added
- **impact** (1-5): How much the task affects your goals
- **severity** (1-5): How critical the issue is  
- **timeliness** (1-5): How urgent the task is
- **effort** (1-5): Resources required (lower is better)
- **strategic_fit** (1-5): Alignment with strategy
- **priority_score** (decimal): Calculated priority score (lower = higher priority)

### Features Implemented
- ✅ Radar chart visualization of task priorities
- ✅ Interactive task dots (size = impact, color = due date urgency)
- ✅ Click to edit priority factors
- ✅ Filter by status (All/Pending/Completed/Starred)
- ✅ Priority list showing top 10 tasks
- ✅ Automatic priority score calculation
- ✅ Color-coded priority levels (Critical/High/Medium/Low)

## Rollback (if needed)
If you need to rollback this migration:

```sql
ALTER TABLE tasks 
DROP COLUMN IF EXISTS impact,
DROP COLUMN IF EXISTS severity,
DROP COLUMN IF EXISTS timeliness,
DROP COLUMN IF EXISTS effort,
DROP COLUMN IF EXISTS strategic_fit,
DROP COLUMN IF EXISTS priority_score;

DROP INDEX IF EXISTS idx_tasks_priority_score;
```