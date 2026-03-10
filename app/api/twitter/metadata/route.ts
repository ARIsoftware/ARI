import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-helpers";

// Parse and validate URL is a legitimate Twitter/X URL to prevent SSRF attacks
function parseValidTwitterUrl(urlString: string): URL | null {
  try {
    const url = new URL(urlString);
    // Only allow HTTPS
    if (url.protocol !== "https:") {
      return null;
    }
    // Only allow twitter.com and x.com domains
    const allowedHosts = ["twitter.com", "www.twitter.com", "x.com", "www.x.com"];
    if (!allowedHosts.includes(url.hostname)) {
      return null;
    }
    // Must be a tweet/status URL pattern
    if (!url.pathname.match(/^\/[A-Za-z0-9_]+\/status\/\d+\/?$/)) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

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

    // Parse and validate URL to prevent SSRF attacks
    const validatedUrl = parseValidTwitterUrl(url);
    if (!validatedUrl) {
      return NextResponse.json({ error: "Invalid Twitter/X URL" }, { status: 400 });
    }

    // Try multiple approaches to get Twitter/X metadata
    let metadata = {
      thumbnail: null,
      title: null,
      description: null,
    };

    try {
      // Method 1: Try to fetch with bot user agents that Twitter allows for Open Graph
      const userAgents = [
        "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
        "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
        "Twitterbot/1.0",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      ];

      for (const userAgent of userAgents) {
        try {
          const response = await fetch(validatedUrl, {
            headers: {
              "User-Agent": userAgent,
              "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
              "Accept-Language": "en-US,en;q=0.5",
            },
            redirect: "follow",
          });

          if (response.ok) {
            const html = await response.text();

            // Extract Open Graph and Twitter Card data
            const ogImageMatch = html.match(/<meta property="og:image" content="([^"]+)"/);
            const twitterImageMatch = html.match(/<meta name="twitter:image" content="([^"]+)"/);
            const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/);
            const twitterTitleMatch = html.match(/<meta name="twitter:title" content="([^"]+)"/);
            const descriptionMatch = html.match(/<meta property="og:description" content="([^"]+)"/);
            const twitterDescMatch = html.match(/<meta name="twitter:description" content="([^"]+)"/);

            const thumbnail = twitterImageMatch?.[1] || ogImageMatch?.[1];

            if (thumbnail) {
              metadata.thumbnail = thumbnail;
              metadata.title = (twitterTitleMatch?.[1] || titleMatch?.[1])?.replace(/&quot;/g, '"').replace(/&amp;/g, '&') || null;
              metadata.description = (twitterDescMatch?.[1] || descriptionMatch?.[1])?.replace(/&quot;/g, '"').replace(/&amp;/g, '&') || null;
              console.log(`Successfully fetched Twitter metadata with user agent: ${userAgent.substring(0, 30)}...`);
              break;
            }
          }
        } catch (e) {
          console.log(`Failed with user agent ${userAgent.substring(0, 30)}:`, e.message);
          continue;
        }
      }

    } catch (fetchError) {
      console.error("All Twitter fetch methods failed:", fetchError);
    }

    // Method 2: Generate a placeholder thumbnail based on tweet ID
    if (!metadata.thumbnail) {
      console.log("Using placeholder thumbnail for Twitter");
      metadata.thumbnail = `https://via.placeholder.com/400x400/1DA1F2/FFFFFF?text=X+Post`;
      metadata.title = metadata.title || "X Post";
    }

    return NextResponse.json(metadata);
  } catch (error: any) {
    console.error("Error fetching Twitter metadata:", error);

    // Return a fallback response instead of error
    return NextResponse.json({
      thumbnail: "https://via.placeholder.com/400x400/1DA1F2/FFFFFF?text=X",
      title: "X Post",
      description: null,
    });
  }
}
