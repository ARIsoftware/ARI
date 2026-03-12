import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { createDbClient } from '@/lib/db-supabase'
import { LICENSE_MODULE_ID } from '@/lib/license-helpers'

function maskKey(key: string): string {
  if (key.length <= 15) return key
  const first = key.slice(0, 11)
  const lastFour = key.slice(-4)
  const middle = key.slice(11, -4).replace(/[A-Za-z0-9]/g, 'X')
  return first + middle + lastFour
}

export async function GET() {
  const { user } = await getAuthenticatedUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createDbClient()

    const { data, error } = await supabase
      .from('module_settings')
      .select('settings')
      .eq('user_id', user.id)
      .eq('module_id', LICENSE_MODULE_ID)
      .single()

    if (error || !data?.settings?.key) {
      // If no DB license, check for env var license key
      const envKey = process.env.ARI_LICENSE_KEY
      return NextResponse.json({ active: false, ...(envKey ? { env_key: envKey } : {}) })
    }

    const settings = data.settings
    return NextResponse.json({
      active: true,
      status: settings.status,
      masked_key: maskKey(settings.key),
      customer_email: settings.customer_email || null,
      expires_at: settings.expires_at || null,
      validated_at: settings.validated_at || null,
    })
  } catch (error) {
    console.error('[API /license/status] Error:', error)
    return NextResponse.json(
      { error: 'Failed to check license status' },
      { status: 500 }
    )
  }
}

export async function DELETE() {
  const { user } = await getAuthenticatedUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createDbClient()

    const { error } = await supabase
      .from('module_settings')
      .delete()
      .eq('user_id', user.id)
      .eq('module_id', LICENSE_MODULE_ID)

    if (error) {
      console.error('[API /license/status] Failed to deactivate:', error)
      return NextResponse.json(
        { error: 'Failed to deactivate license' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[API /license/status] Error:', error)
    return NextResponse.json(
      { error: 'Failed to deactivate license' },
      { status: 500 }
    )
  }
}
