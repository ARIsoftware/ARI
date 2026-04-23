/**
 * Database mode configuration.
 *
 * ARI supports three database backends:
 *   - postgres:       Local PostgreSQL (default, no Docker required)
 *   - supabaselocal:  Local Supabase stack (requires Docker)
 *   - supabasecloud:  Supabase.com hosted project
 *
 * Set via ARI_DB_MODE in .env.local. Existing installs without the
 * variable are auto-detected from NEXT_PUBLIC_SUPABASE_URL presence.
 */

export type DbMode = 'postgres' | 'supabaselocal' | 'supabasecloud'

export function getDbMode(): DbMode {
  const explicit = process.env.ARI_DB_MODE
  if (explicit === 'postgres' || explicit === 'supabaselocal' || explicit === 'supabasecloud') {
    return explicit
  }
  // Backward compat for existing installs without ARI_DB_MODE
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl) return 'postgres'
  if (supabaseUrl.includes('127.0.0.1') || supabaseUrl.includes('localhost')) return 'supabaselocal'
  return 'supabasecloud'
}

export function isSupabaseMode(): boolean {
  const mode = getDbMode()
  return mode === 'supabaselocal' || mode === 'supabasecloud'
}
