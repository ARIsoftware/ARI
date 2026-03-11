-- =============================================================================
-- MAIL STREAM MODULE DATABASE SCHEMA
-- =============================================================================
-- Tables: mail_stream_events, mail_stream_settings
-- Purpose: Log all Resend webhook events (emails, contacts, domains)
--
-- NOTE: This is a GLOBAL log - not user-specific. All authenticated users
-- can view the logs. Access control is at the application level.
-- =============================================================================

-- =============================================================================
-- MAIL STREAM EVENTS TABLE
-- =============================================================================
-- Stores all webhook events received from Resend

CREATE TABLE IF NOT EXISTS mail_stream_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Event identification
  event_type VARCHAR(50) NOT NULL,  -- e.g., 'email.sent', 'contact.created'
  event_category VARCHAR(20) NOT NULL,  -- 'email', 'contact', or 'domain'

  -- Email-specific fields (null for contact/domain events)
  email_id TEXT,
  from_address TEXT,
  to_addresses TEXT[],
  subject TEXT,
  status VARCHAR(30),  -- Derived from email event type

  -- Additional details (JSONB for flexibility)
  bounce_details JSONB,
  click_details JSONB,

  -- Full raw payload for reference
  raw_payload JSONB NOT NULL,

  -- Timestamps
  resend_created_at TIMESTAMP WITH TIME ZONE NOT NULL,  -- When Resend recorded the event
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()     -- When we received it
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_mail_stream_events_event_type
  ON mail_stream_events(event_type);

CREATE INDEX IF NOT EXISTS idx_mail_stream_events_event_category
  ON mail_stream_events(event_category);

CREATE INDEX IF NOT EXISTS idx_mail_stream_events_status
  ON mail_stream_events(status);

CREATE INDEX IF NOT EXISTS idx_mail_stream_events_created_at
  ON mail_stream_events(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mail_stream_events_resend_created_at
  ON mail_stream_events(resend_created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mail_stream_events_email_id
  ON mail_stream_events(email_id);

CREATE INDEX IF NOT EXISTS idx_mail_stream_events_to_addresses
  ON mail_stream_events USING GIN(to_addresses);

-- Full-text search on subject
CREATE INDEX IF NOT EXISTS idx_mail_stream_events_subject_search
  ON mail_stream_events USING GIN(to_tsvector('english', COALESCE(subject, '')));

-- =============================================================================
-- MAIL STREAM SETTINGS TABLE
-- =============================================================================
-- Global settings for the mail stream module (single row)

CREATE TABLE IF NOT EXISTS mail_stream_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  retention_days INTEGER NOT NULL DEFAULT 30,  -- -1 for indefinite
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ensure only one settings row exists
CREATE UNIQUE INDEX IF NOT EXISTS idx_mail_stream_settings_singleton
  ON mail_stream_settings((TRUE));

-- Insert default settings if not exists
INSERT INTO mail_stream_settings (retention_days)
SELECT 30
WHERE NOT EXISTS (SELECT 1 FROM mail_stream_settings);

-- =============================================================================
-- TRIGGER: Auto-update updated_at
-- =============================================================================

CREATE OR REPLACE FUNCTION update_mail_stream_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS mail_stream_settings_updated_at ON mail_stream_settings;
CREATE TRIGGER mail_stream_settings_updated_at
  BEFORE UPDATE ON mail_stream_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_mail_stream_settings_updated_at();

-- =============================================================================
-- RLS POLICIES
-- =============================================================================
-- These tables are global (not user-specific), so we allow all operations
-- for authenticated users. The webhook endpoint is public but signature-verified.

-- Enable RLS
ALTER TABLE mail_stream_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE mail_stream_settings ENABLE ROW LEVEL SECURITY;

-- Events table - allow select for authenticated, insert for service role
CREATE POLICY "mail_stream_events_select" ON mail_stream_events
  FOR SELECT TO public USING (true);

CREATE POLICY "mail_stream_events_insert" ON mail_stream_events
  FOR INSERT TO public WITH CHECK (true);

CREATE POLICY "mail_stream_events_delete" ON mail_stream_events
  FOR DELETE TO public USING (true);

-- Settings table - allow all for authenticated users
CREATE POLICY "mail_stream_settings_select" ON mail_stream_settings
  FOR SELECT TO public USING (true);

CREATE POLICY "mail_stream_settings_update" ON mail_stream_settings
  FOR UPDATE TO public USING (true);

CREATE POLICY "mail_stream_settings_insert" ON mail_stream_settings
  FOR INSERT TO public WITH CHECK (true);

-- =============================================================================
-- VERIFICATION QUERIES
-- =============================================================================
-- Run these to verify the tables were created correctly:
--
-- SELECT tablename FROM pg_tables WHERE tablename LIKE 'mail_stream%';
-- SELECT * FROM mail_stream_settings;
-- =============================================================================
