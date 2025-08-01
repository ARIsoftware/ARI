-- First, check if the contacts table exists and drop it if needed
DROP TABLE IF EXISTS contacts CASCADE;

-- Create the contacts table with all required columns
CREATE TABLE contacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  company TEXT,
  address TEXT,
  website TEXT,
  birthday DATE,
  next_contact_date DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX idx_contacts_category ON contacts(category);
CREATE INDEX idx_contacts_name ON contacts(name);

-- Enable Row Level Security
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

-- Create a policy that allows all operations for now
CREATE POLICY "Allow all operations on contacts" ON contacts
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

-- Create or replace the updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Drop the trigger if it exists and recreate it
DROP TRIGGER IF EXISTS update_contacts_updated_at ON contacts;
CREATE TRIGGER update_contacts_updated_at 
  BEFORE UPDATE ON contacts
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Insert some sample data (optional - remove this section if you don't want sample data)
INSERT INTO contacts (name, email, phone, category, description, company, next_contact_date) VALUES
  ('Sarah Johnson', 'sarah.johnson@email.com', '+1 (555) 123-4567', 'Work', 'Marketing manager at TechCorp. Prefers email communication.', 'TechCorp', '2025-05-20'),
  ('Michael Chen', 'mike.chen@gmail.com', '+1 (555) 987-6543', 'Friends', 'College roommate. Lives in San Francisco now. Software engineer at Google.', 'Google', NULL),
  ('Emily Rodriguez', 'emily.rodriguez@company.com', '+1 (555) 456-7890', 'Work', 'Project manager for the mobile app redesign. Very responsive via Slack.', NULL, NULL),
  ('David Thompson', 'dad@family.com', '+1 (555) 321-0987', 'Family', 'Dad''s new phone number. Retired last year, enjoys gardening.', NULL, NULL);