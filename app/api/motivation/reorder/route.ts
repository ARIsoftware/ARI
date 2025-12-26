import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { motivationContent } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export async function POST(req: NextRequest) {
  try {
    // Authenticate user first
    const { user, withRLS } = await getAuthenticatedUser();

    if (!user || !withRLS) {
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
    for (let i = 0; i < items.length; i++) {
      await withRLS((db) =>
        db.update(motivationContent)
          .set({ position: i })
          .where(eq(motivationContent.id, items[i].id))
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("Reorder error:", error);
    return NextResponse.json(
      { error: "Failed to reorder items" },
      { status: 500 }
    );
  }
}
