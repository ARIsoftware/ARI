import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-helpers";

// Parse and validate URL is a legitimate Instagram URL to prevent SSRF attacks
function parseValidInstagramUrl(urlString: string): URL | null {
  try {
    const url = new URL(urlString);
    // Only allow HTTPS
    if (url.protocol !== "https:") {
      return null;
    }
    // Only allow instagram.com domain
    const allowedHosts = ["instagram.com", "www.instagram.com"];
    if (!allowedHosts.includes(url.hostname)) {
      return null;
    }
    // Must be a post URL pattern
    if (!url.pathname.match(/^\/p\/[A-Za-z0-9_-]+\/?$/) &&
        !url.pathname.match(/^\/reel\/[A-Za-z0-9_-]+\/?$/)) {
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
    const validatedUrl = parseValidInstagramUrl(url);
    if (!validatedUrl) {
      return NextResponse.json({ error: "Invalid Instagram URL" }, { status: 400 });
    }

    // Try multiple approaches to get Instagram metadata
    let metadata = {
      thumbnail: null,
      title: null,
      description: null,
    };

    try {
      // Method 1: Try Instagram's oEmbed API (most reliable)
      try {
        const oembedUrl = `https://graph.facebook.com/v18.0/instagram_oembed?url=${encodeURIComponent(validatedUrl.toString())}&access_token=&fields=thumbnail_url,title,author_name`;

        // Try without access token first (sometimes works for public posts)
        const oembedResponse = await fetch(oembedUrl);

        if (oembedResponse.ok) {
          const oembedData = await oembedResponse.json();
          if (oembedData.thumbnail_url) {
            metadata.thumbnail = oembedData.thumbnail_url;
            metadata.title = oembedData.title || (oembedData.author_name ? `Post by ${oembedData.author_name}` : null);
          }
        }
      } catch (e) {
        // oEmbed is optional, fall through to other methods
      }

      // Method 2: Try to fetch with different user agents
      if (!metadata.thumbnail) {
        const userAgents = [
          "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
          "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
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

              // Extract Open Graph data
              const ogImageMatch = html.match(/<meta property="og:image" content="([^"]+)"/);
              const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/);
              const descriptionMatch = html.match(/<meta property="og:description" content="([^"]+)"/);

              if (ogImageMatch) {
                metadata.thumbnail = ogImageMatch[1];
                metadata.title = titleMatch ? titleMatch[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&') : null;
                metadata.description = descriptionMatch ? descriptionMatch[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&') : null;
                break;
              }
            }
          } catch (e) {
            continue;
          }
        }
      }

      // Method 3: Try Instagram embed URL
      if (!metadata.thumbnail) {
        const embedUrl = validatedUrl.toString().replace(/\/$/, "") + "/embed/captioned/";
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
          // Embed method is optional, fall through to placeholder
        }
      }

    } catch (fetchError) {
      console.error("All fetch methods failed:", fetchError);
    }

    // Method 4: Generate a placeholder thumbnail based on post ID
    if (!metadata.thumbnail) {
      const postIdMatch = validatedUrl.pathname.match(/\/p\/([A-Za-z0-9_-]+)/);
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
