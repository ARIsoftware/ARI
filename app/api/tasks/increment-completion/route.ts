// This file redirects to the new module API
// The tasks module is now at /api/modules/tasks
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  return NextResponse.redirect(new URL('/api/modules/tasks/increment-completion', request.url), { status: 308 })
}
