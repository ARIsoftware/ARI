// This file redirects to the new module API
// The tasks module is now at /api/modules/tasks
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  return NextResponse.redirect(new URL('/api/modules/tasks', request.url))
}

export async function POST(request: NextRequest) {
  return NextResponse.redirect(new URL('/api/modules/tasks', request.url), { status: 308 })
}

export async function PUT(request: NextRequest) {
  return NextResponse.redirect(new URL('/api/modules/tasks', request.url), { status: 308 })
}

export async function DELETE(request: NextRequest) {
  return NextResponse.redirect(new URL('/api/modules/tasks', request.url), { status: 308 })
}
