import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    // Use service role key for admin operations
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // Check if table exists by querying information schema
    const { data: tableExists } = await supabaseAdmin
      .from("motivation_content")
      .select("id")
      .limit(1);

    // Table check will succeed even if empty, error only if doesn't exist
    let tableCreated = false;
    if (!tableExists) {
      // For now, we'll just log this since table creation requires migration
      console.log("Table needs to be created via migration");
      tableCreated = false;
    } else {
      tableCreated = true;
    }

    // Check and create storage bucket
    const { data: buckets } = await supabaseAdmin.storage.listBuckets();
    const bucketExists = buckets?.some((b) => b.name === "motivation-photos");

    let bucketCreated = true;
    if (!bucketExists) {
      const { error: bucketError } = await supabaseAdmin.storage.createBucket(
        "motivation-photos",
        {
          public: true,
          fileSizeLimit: 5242880, // 5MB
          allowedMimeTypes: [
            "image/jpeg",
            "image/png",
            "image/gif",
            "image/webp",
          ],
        }
      );

      if (bucketError) {
        console.error("Bucket creation error:", bucketError);
        bucketCreated = false;
      }
    }

    return NextResponse.json({
      success: true,
      tableReady: tableCreated,
      bucketReady: bucketCreated,
    });
  } catch (error: any) {
    console.error("Setup error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}