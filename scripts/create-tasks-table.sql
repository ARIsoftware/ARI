-- Create the ari-database table for tasks
CREATE TABLE IF NOT EXISTS "ari-database" (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  assignees TEXT[] DEFAULT '{}',
  due_date DATE,
  subtasks_completed INTEGER DEFAULT 0,
  subtasks_total INTEGER DEFAULT 0,
  status TEXT DEFAULT 'Pending' CHECK (status IN ('Pending', 'In Progress', 'Completed')),
  priority TEXT DEFAULT 'Medium' CHECK (priority IN ('Low', 'Medium', 'High')),
  starred BOOLEAN DEFAULT false,
  completed BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create an index on status for faster filtering
CREATE INDEX IF NOT EXISTS idx_ari_database_status ON "ari-database" (status);

-- Create an index on starred for faster filtering
CREATE INDEX IF NOT EXISTS idx_ari_database_starred ON "ari-database" (starred);

-- Create an index on completed for faster filtering
CREATE INDEX IF NOT EXISTS idx_ari_database_completed ON "ari-database" (completed);

-- Insert sample data
INSERT INTO "ari-database" (title, assignees, due_date, subtasks_completed, subtasks_total, status, priority, starred, completed) VALUES
('Design homepage layout', ARRAY['Emily Carter', 'Liam Walker'], '2023-06-04', 1, 2, 'In Progress', 'High', true, false),
('Conduct user interviews', ARRAY['Liam Walker'], '2023-06-11', 1, 2, 'Pending', 'Medium', false, false),
('Write unit tests', ARRAY['Sophie Lee'], '2023-06-06', 0, 2, 'In Progress', 'High', true, false),
('Prepare launch checklist', ARRAY['Daniel Kim', 'Olivia Adams'], '2023-06-19', 0, 1, 'Pending', 'Low', false, false),
('Update privacy policy', ARRAY['Olivia Adams'], '2023-06-13', 1, 2, 'In Progress', 'Medium', false, false),
('Deploy to staging', ARRAY['Noah Bennett'], '2023-06-01', 2, 2, 'Pending', 'High', true, false);
