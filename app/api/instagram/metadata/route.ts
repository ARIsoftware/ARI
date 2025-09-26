import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    // Fetch the Instagram page
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; bot)"
      }
    });

    if (!response.ok) {
      throw new Error("Failed to fetch Instagram page");
    }

    const html = await response.text();

    // Extract Open Graph image (Instagram posts have og:image meta tags)
    const ogImageMatch = html.match(/<meta property="og:image" content="([^"]+)"/);
    const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/);
    const descriptionMatch = html.match(/<meta property="og:description" content="([^"]+)"/);

    const metadata = {
      thumbnail: ogImageMatch ? ogImageMatch[1] : null,
      title: titleMatch ? titleMatch[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&') : null,
      description: descriptionMatch ? descriptionMatch[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&') : null,
    };

    return NextResponse.json(metadata);
  } catch (error: any) {
    console.error("Error fetching Instagram metadata:", error);
    return NextResponse.json(
      { error: "Failed to fetch Instagram metadata" },
      { status: 500 }
    );
  }
}