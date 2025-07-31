-- Create fitness completion history table
CREATE TABLE IF NOT EXISTS fitness_completion_history (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  fitness_task_title TEXT NOT NULL,
  completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_fitness_completion_history_user_id ON fitness_completion_history(user_id);
CREATE INDEX IF NOT EXISTS idx_fitness_completion_history_completed_at ON fitness_completion_history(completed_at);

-- Enable RLS
ALTER TABLE fitness_completion_history ENABLE ROW LEVEL SECURITY;

-- Create RLS policy
CREATE POLICY "Users can only see their own completion history" ON fitness_completion_history
  FOR ALL USING (user_id = auth.jwt() ->> 'sub');
