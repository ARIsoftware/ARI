import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, createAuthenticatedClient } from "@/lib/auth-helpers";

export async function POST(req: NextRequest) {
  try {
    const { user } = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { itemId } = await req.json();

    if (!itemId) {
      return NextResponse.json({ error: "Item ID is required" }, { status: 400 });
    }

    const supabase = await createAuthenticatedClient();

    // Get the item
    const { data: item, error: fetchError } = await supabase
      .from("motivation_content")
      .select("*")
      .eq("id", itemId)
      .eq("user_id", user.id)
      .single();

    if (fetchError || !item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

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
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\s]+)/
      )?.[1];

      if (videoId) {
        thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
      }
    }

    // Update the item with new thumbnail
    if (thumbnailUrl) {
      const { error: updateError } = await supabase
        .from("motivation_content")
        .update({ thumbnail_url: thumbnailUrl })
        .eq("id", itemId)
        .eq("user_id", user.id);

      if (updateError) {
        return NextResponse.json({ error: "Failed to update thumbnail" }, { status: 500 });
      }

      return NextResponse.json({ success: true, thumbnail_url: thumbnailUrl });
    } else {
      return NextResponse.json({ error: "Could not fetch thumbnail" }, { status: 400 });
    }

  } catch (error: any) {
    console.error("Error refreshing thumbnail:", error);
    return NextResponse.json({ error: error.message || "Failed to refresh thumbnail" }, { status: 500 });
  }
}
