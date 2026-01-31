-- Mail Stream Events - Composite Index for Query Optimization
--
-- The data route queries with:
--   WHERE event_category = X AND status = Y
--   ORDER BY created_at DESC
--   LIMIT 100
--
-- A composite index covering these columns in order will allow
-- index-only scans and avoid sorting.

-- Composite index for filtered + sorted queries
CREATE INDEX IF NOT EXISTS idx_mail_stream_events_category_status_created
ON mail_stream_events (event_category, status, created_at DESC);

-- For queries that filter only by category (no status filter)
CREATE INDEX IF NOT EXISTS idx_mail_stream_events_category_created
ON mail_stream_events (event_category, created_at DESC);
