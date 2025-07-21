-- Add order column to the ari-database table
ALTER TABLE "ari-database" ADD COLUMN IF NOT EXISTS "order_index" INTEGER;

-- Create a temporary sequence to assign order values
DO $$
DECLARE
    task_record RECORD;
    current_order INTEGER := 0;
BEGIN
    -- Update existing tasks with order_index based on created_at (newest first)
    FOR task_record IN 
        SELECT id FROM "ari-database" 
        ORDER BY created_at DESC
    LOOP
        UPDATE "ari-database" 
        SET order_index = current_order 
        WHERE id = task_record.id;
        
        current_order := current_order + 1;
    END LOOP;
END $$;

-- Set default value for future inserts
ALTER TABLE "ari-database" ALTER COLUMN order_index SET DEFAULT 0;

-- Create an index on order_index for faster sorting
CREATE INDEX IF NOT EXISTS idx_ari_database_order ON "ari-database" (order_index);
