import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"
import { clerkClient } from "@clerk/nextjs/server"

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization")
    
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Missing or invalid authorization header" }, { status: 401 })
    }

    const token = authHeader.substring(7)
    
    const decoded = JSON.parse(atob(token.split('.')[1]))
    const userEmail = decoded.email

    if (!userEmail) {
      return NextResponse.json({ error: "No email found in token" }, { status: 401 })
    }

    const { data, error } = await supabase
      .from("goals")
      .select("*")
      .eq("user_email", userEmail)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Supabase error:", error)
      return NextResponse.json({ error: "Database error" }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error("API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization")
    
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Missing or invalid authorization header" }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const decoded = JSON.parse(atob(token.split('.')[1]))
    const userEmail = decoded.email

    if (!userEmail) {
      return NextResponse.json({ error: "No email found in token" }, { status: 401 })
    }

    const body = await request.json()
    const { title, description, category, priority, deadline } = body

    if (!title || !description) {
      return NextResponse.json({ error: "Title and description are required" }, { status: 400 })
    }

    const goalData = {
      title,
      description,
      category: category || null,
      priority: priority || "medium",
      deadline: deadline || null,
      progress: 0,
      user_email: userEmail,
    }

    const { data, error } = await supabase
      .from("goals")
      .insert([goalData])
      .select()
      .single()

    if (error) {
      console.error("Supabase error:", error)
      return NextResponse.json({ error: "Database error" }, { status: 500 })
    }

    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    console.error("API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}