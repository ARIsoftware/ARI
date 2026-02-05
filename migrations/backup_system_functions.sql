-- ================================================================
-- Backup System Database Functions
-- ================================================================
-- Run this migration in your Supabase SQL Editor to enable
-- complete backup functionality including empty table support.
--
-- These functions allow the backup system to:
-- 1. Discover all tables in the database
-- 2. Get column schemas for all tables (including empty ones)
-- 3. Execute arbitrary read-only queries (for schema discovery)
-- ================================================================

-- Function 1: Get all user tables with metadata
-- This function is already working, but included for completeness
CREATE OR REPLACE FUNCTION get_all_user_tables()
RETURNS TABLE (
  table_name text,
  row_count bigint,
  has_rls boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.tablename::text as table_name,
    (xpath('/row/cnt/text()', xml_count))[1]::text::bigint as row_count,
    t.rowsecurity as has_rls
  FROM pg_tables t
  CROSS JOIN LATERAL (
    SELECT query_to_xml(
      format('SELECT COUNT(*) as cnt FROM %I.%I', t.schemaname, t.tablename),
      false, false, ''
    ) as xml_count
  ) x
  WHERE t.schemaname = 'public'
    AND t.tablename NOT IN ('spatial_ref_sys', 'schema_migrations', 'pg_stat_statements', 'geography_columns', 'geometry_columns')
  ORDER BY t.tablename;
END;
$$;

-- Function 2: Get all table columns (for schema discovery)
-- Returns column information for ALL tables in one query
CREATE OR REPLACE FUNCTION get_all_table_columns()
RETURNS TABLE (
  table_name text,
  column_name text,
  data_type text,
  is_nullable text,
  column_default text,
  character_maximum_length integer,
  ordinal_position integer
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.table_name::text,
    c.column_name::text,
    c.data_type::text,
    c.is_nullable::text,
    c.column_default::text,
    c.character_maximum_length::integer,
    c.ordinal_position::integer
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
  ORDER BY c.table_name, c.ordinal_position;
END;
$$;

-- Function 3: Get table row counts (for verification)
CREATE OR REPLACE FUNCTION get_table_row_counts()
RETURNS TABLE (
  table_name text,
  row_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.tablename::text as table_name,
    (xpath('/row/cnt/text()', xml_count))[1]::text::bigint as row_count
  FROM pg_tables t
  CROSS JOIN LATERAL (
    SELECT query_to_xml(
      format('SELECT COUNT(*) as cnt FROM %I.%I', t.schemaname, t.tablename),
      false, false, ''
    ) as xml_count
  ) x
  WHERE t.schemaname = 'public'
    AND t.tablename NOT IN ('spatial_ref_sys', 'schema_migrations', 'pg_stat_statements', 'geography_columns', 'geometry_columns')
  ORDER BY t.tablename;
END;
$$;

-- Function 4: Execute read-only SQL (for flexible queries)
-- SECURITY NOTE: This function executes arbitrary SQL but is limited to SELECT queries
CREATE OR REPLACE FUNCTION exec_sql(query text)
RETURNS SETOF json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only allow SELECT queries (read-only)
  IF NOT (lower(trim(query)) LIKE 'select%') THEN
    RAISE EXCEPTION 'Only SELECT queries are allowed';
  END IF;

  RETURN QUERY EXECUTE format('SELECT row_to_json(t) FROM (%s) t', query);
END;
$$;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION get_all_user_tables() TO authenticated;
GRANT EXECUTE ON FUNCTION get_all_table_columns() TO authenticated;
GRANT EXECUTE ON FUNCTION get_table_row_counts() TO authenticated;
GRANT EXECUTE ON FUNCTION exec_sql(text) TO authenticated;

-- Also grant to service_role for backup operations
GRANT EXECUTE ON FUNCTION get_all_user_tables() TO service_role;
GRANT EXECUTE ON FUNCTION get_all_table_columns() TO service_role;
GRANT EXECUTE ON FUNCTION get_table_row_counts() TO service_role;
GRANT EXECUTE ON FUNCTION exec_sql(text) TO service_role;

-- ================================================================
-- Verification: Run these queries to confirm functions work
-- ================================================================
-- SELECT * FROM get_all_user_tables() LIMIT 5;
-- SELECT * FROM get_all_table_columns() WHERE table_name = 'user';
-- SELECT * FROM get_table_row_counts() LIMIT 5;
-- SELECT * FROM exec_sql('SELECT table_name FROM information_schema.tables WHERE table_schema = ''public'' LIMIT 5');
