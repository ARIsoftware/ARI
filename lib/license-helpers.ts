import { createDbClient } from '@/lib/db-supabase'

export const LICENSE_MODULE_ID = "__license__"
export const MODULES_API_BASE = "https://api.ari.software"

const PLATFORM = process.platform === 'darwin' ? 'darwin' : process.platform === 'win32' ? 'windows' : 'linux'

export function buildClientInfo() {
  return {
    ari_version: "1.0.0",
    platform: PLATFORM,
    timestamp: new Date().toISOString(),
  }
}

/** Session cache keys (used by both /modules and /module-library pages) */
export const LICENSE_CACHE_KEY = 'ari_license_status_cache'
export const LIBRARY_CACHE_KEY = 'ari_module_library_cache'
export const CACHE_TTL = 5 * 60 * 1000

/**
 * Get the active license key for a user.
 * Checks DB first, then falls back to ARI_LICENSE_KEY env var.
 */
export async function getLicenseKey(userId: string): Promise<string | null> {
  const supabase = createDbClient()
  const { data } = await supabase
    .from('module_settings')
    .select('settings')
    .eq('user_id', userId)
    .eq('module_id', LICENSE_MODULE_ID)
    .single()

  if (data?.settings?.key) return data.settings.key

  return process.env.ARI_LICENSE_KEY || null
}
