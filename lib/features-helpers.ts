import { createServerClient } from '@supabase/ssr'
import type { NextRequest } from 'next/server'
import { getUrlToFeatureMap } from './menu-config'

// Get dynamic route to feature name mapping
export const ROUTE_FEATURE_MAP = getUrlToFeatureMap()

export async function getUserFeaturePreferences(
  req: NextRequest,
  userId: string
): Promise<Record<string, boolean>> {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value))
        },
      },
    }
  )

  try {
    const { data, error } = await supabase
      .from('user_feature_preferences')
      .select('feature_name, enabled')
      .eq('user_id', userId)

    if (error) {
      console.error('Error fetching feature preferences:', error)
      return {}
    }

    const preferences: Record<string, boolean> = {}
    data?.forEach(pref => {
      preferences[pref.feature_name] = pref.enabled
    })

    return preferences
  } catch (error) {
    console.error('Error in getUserFeaturePreferences:', error)
    return {}
  }
}

export function isFeatureEnabled(
  pathname: string,
  preferences: Record<string, boolean>
): boolean {
  const featureName = ROUTE_FEATURE_MAP[pathname]
  if (!featureName) {
    // If route is not mapped to a feature, allow access
    return true
  }

  // Default to true if no preference is set
  return preferences[featureName] ?? true
}
