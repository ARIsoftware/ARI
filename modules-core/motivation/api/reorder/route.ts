import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from '@/lib/auth-helpers';

export async function POST(req: NextRequest) {
  try {
    // Authenticate user first
    const { user, supabase } = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const { items } = await req.json();

    if (!items || !Array.isArray(items)) {
      return NextResponse.json({ error: "Invalid items array" }, { status: 400 });
    }

    // Update positions for all items (RLS ensures user can only update their own items)
    const updates = items.map((item, index) => ({
      id: item.id,
      position: index,
    }));

    // Batch update all positions - RLS automatically restricts to user's own items
    for (const update of updates) {
      const { error } = await supabase
        .from("motivation_content")
        .update({ position: update.position })
        .eq("id", update.id)
        .eq("user_id", user.id);

      if (error) {
        console.error("Error updating position:", error);
        throw error;
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Reorder error:", error);
    return NextResponse.json(
      { error: "Failed to reorder items" },
      { status: 500 }
    );
  }
}