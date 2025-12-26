import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-helpers";
import { motivationContent } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export async function POST(req: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser();

    if (!user || !withRLS) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { itemId } = await req.json();

    if (!itemId) {
      return NextResponse.json({ error: "Item ID is required" }, { status: 400 });
    }

    // Get the item (RLS filters automatically)
    const itemData = await withRLS((db) =>
      db.select()
        .from(motivationContent)
        .where(eq(motivationContent.id, itemId))
        .limit(1)
    );

    if (itemData.length === 0) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    const item = itemData[0];
    let thumbnailUrl = null;

    // Fetch metadata based on type
    if (item.type === "instagram" && item.url) {
      try {
        // Get the host from the request
        const protocol = req.headers.get('x-forwarded-proto') || 'http';
        const host = req.headers.get('host') || 'localhost:3000';
        const baseUrl = `${protocol}://${host}`;

        const response = await fetch(`${baseUrl}/api/instagram/metadata`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": req.headers.get("Authorization") || "",
          },
          body: JSON.stringify({ url: item.url }),
        });

        if (response.ok) {
          const metadata = await response.json();
          if (metadata.thumbnail && !metadata.thumbnail.includes('placeholder')) {
            thumbnailUrl = metadata.thumbnail;
          }
        }
      } catch (error) {
        console.error("Failed to fetch Instagram metadata:", error);
      }
    } else if (item.type === "twitter" && item.url) {
      try {
        // Get the host from the request
        const protocol = req.headers.get('x-forwarded-proto') || 'http';
        const host = req.headers.get('host') || 'localhost:3000';
        const baseUrl = `${protocol}://${host}`;

        const response = await fetch(`${baseUrl}/api/twitter/metadata`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": req.headers.get("Authorization") || "",
          },
          body: JSON.stringify({ url: item.url }),
        });

        if (response.ok) {
          const metadata = await response.json();
          if (metadata.thumbnail && !metadata.thumbnail.includes('placeholder')) {
            thumbnailUrl = metadata.thumbnail;
          }
        }
      } catch (error) {
        console.error("Failed to fetch Twitter metadata:", error);
      }
    } else if (item.type === "youtube" && item.url) {
      const videoId = item.url.match(
        /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([^&\s?]+)/
      )?.[1];

      if (videoId) {
        thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
      }
    }

    // Update the item with new thumbnail
    if (thumbnailUrl) {
      await withRLS((db) =>
        db.update(motivationContent)
          .set({ thumbnailUrl })
          .where(eq(motivationContent.id, itemId))
      );

      return NextResponse.json({ success: true, thumbnail_url: thumbnailUrl });
    } else {
      return NextResponse.json({ error: "Could not fetch thumbnail" }, { status: 400 });
    }

  } catch (error: unknown) {
    console.error("Error refreshing thumbnail:", error);
    return NextResponse.json({ error: "Failed to refresh thumbnail" }, { status: 500 });
  }
}
