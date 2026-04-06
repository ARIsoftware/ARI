import { NextRequest, NextResponse } from "next/server"
import { Pool } from "pg"
import { setupSql } from "@/lib/db/setup-sql"

export async function POST(request: NextRequest) {
  const { databaseUrl } = await request.json()

  // Use the provided DATABASE_URL (since .env.local may have just been written
  // and the server hasn't restarted yet), fall back to env var
  const connectionString = databaseUrl || process.env.DATABASE_URL

  if (!connectionString) {
    return NextResponse.json(
      { error: "No DATABASE_URL provided. Please complete the Supabase step first." },
      { status: 400 }
    )
  }

  const tempPool = new Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 15000,
    ssl: { rejectUnauthorized: false },
  })

  try {
    await tempPool.query(setupSql)
    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown database error"
    return NextResponse.json({ error: message }, { status: 500 })
  } finally {
    await tempPool.end()
  }
}
