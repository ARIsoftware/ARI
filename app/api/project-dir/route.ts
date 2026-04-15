import { NextResponse } from "next/server"
import { existsSync } from "fs"
import path from "path"

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const hasAnonKey = !!(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  const hasServiceKey = !!(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)
  const hasDatabaseUrl = !!process.env.DATABASE_URL
  const isLocal = !!supabaseUrl && (supabaseUrl.includes("127.0.0.1") || supabaseUrl.includes("localhost"))

  return NextResponse.json({
    dir: process.cwd(),
    envFileExists: existsSync(path.join(process.cwd(), ".env.local")),
    localSupabase: {
      detected: isLocal && hasAnonKey && hasServiceKey && hasDatabaseUrl,
    },
  })
}
