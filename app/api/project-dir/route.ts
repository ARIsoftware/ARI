import { NextResponse } from "next/server"
import { existsSync } from "node:fs"
import { resolve } from "node:path"

export async function GET() {
  const hasSupabaseUrl = !!process.env.NEXT_PUBLIC_SUPABASE_URL
  const hasAnonKey = !!(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
  const hasServiceKey = !!(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY)
  const hasDatabaseUrl = !!process.env.DATABASE_URL
  const envFileExists = existsSync(resolve(process.cwd(), ".env.supabase.local"))

  return NextResponse.json({
    dir: process.cwd(),
    localSupabase: {
      detected: hasSupabaseUrl && hasAnonKey && hasServiceKey && hasDatabaseUrl,
      envFileExists,
    },
  })
}
