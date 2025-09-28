import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-helpers";

export async function POST(req: NextRequest) {
  try {
    const { user } = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { url } = await req.json();

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    // Try multiple approaches to get Instagram metadata
    let metadata = {
      thumbnail: null,
      title: null,
      description: null,
    };

    try {
      // Method 1: Try to fetch with different user agents
      const userAgents = [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "facebookexternalhit/1.1"
      ];

      for (const userAgent of userAgents) {
        try {
          const response = await fetch(url, {
            headers: {
              "User-Agent": userAgent,
              "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
              "Accept-Language": "en-US,en;q=0.5",
              "Accept-Encoding": "gzip, deflate",
              "Connection": "keep-alive",
              "Upgrade-Insecure-Requests": "1",
            },
            redirect: "follow",
          });

          if (response.ok) {
            const html = await response.text();

            // Extract Open Graph data
            const ogImageMatch = html.match(/<meta property="og:image" content="([^"]+)"/);
            const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/);
            const descriptionMatch = html.match(/<meta property="og:description" content="([^"]+)"/);

            if (ogImageMatch) {
              metadata.thumbnail = ogImageMatch[1];
              metadata.title = titleMatch ? titleMatch[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&') : null;
              metadata.description = descriptionMatch ? descriptionMatch[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&') : null;
              break; // Success, exit loop
            }
          }
        } catch (e) {
          console.log(`Failed with user agent ${userAgent}:`, e.message);
          continue;
        }
      }

      // Method 2: Try Instagram embed URL
      if (!metadata.thumbnail) {
        const embedUrl = url.replace(/\/$/, "") + "/embed/captioned/";
        try {
          const embedResponse = await fetch(embedUrl, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            }
          });

          if (embedResponse.ok) {
            const embedHtml = await embedResponse.text();
            const embedImageMatch = embedHtml.match(/"display_url":"([^"]+)"/);
            if (embedImageMatch) {
              metadata.thumbnail = embedImageMatch[1].replace(/\\u0026/g, '&');
            }
          }
        } catch (e) {
          console.log("Embed method failed:", e.message);
        }
      }

    } catch (fetchError) {
      console.error("All fetch methods failed:", fetchError);
    }

    // Method 3: Generate a placeholder thumbnail based on post ID
    if (!metadata.thumbnail) {
      const postIdMatch = url.match(/\/p\/([A-Za-z0-9_-]+)/);
      if (postIdMatch) {
        // Create a consistent placeholder based on the post ID
        metadata.thumbnail = `https://via.placeholder.com/400x400/E4405F/FFFFFF?text=IG+Post`;
        metadata.title = metadata.title || "Instagram Post";
      }
    }

    return NextResponse.json(metadata);
  } catch (error: any) {
    console.error("Error fetching Instagram metadata:", error);

    // Return a fallback response instead of error
    return NextResponse.json({
      thumbnail: "https://via.placeholder.com/400x400/E4405F/FFFFFF?text=Instagram",
      title: "Instagram Post",
      description: null,
    });
  }
}
