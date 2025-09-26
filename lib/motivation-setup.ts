import { SupabaseClient } from '@supabase/supabase-js';

export async function ensureMotivationSetup(supabase: SupabaseClient) {
  try {
    // Check if the motivation_content table exists
    const { data: tables, error: tablesError } = await supabase
      .from('motivation_content')
      .select('id')
      .limit(1);

    // If table doesn't exist, create it
    if (tablesError?.message?.includes('relation "public.motivation_content" does not exist')) {
      console.log('Creating motivation_content table...');

      const { error: createError } = await supabase.rpc('create_motivation_table', {
        sql: `
          CREATE TABLE IF NOT EXISTS motivation_content (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
            type TEXT NOT NULL CHECK (type IN ('youtube', 'instagram', 'photo')),
            title TEXT,
            url TEXT,
            thumbnail_url TEXT,
            image_url TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          );

          ALTER TABLE motivation_content ENABLE ROW LEVEL SECURITY;

          CREATE POLICY "Users can view own motivation content"
            ON motivation_content FOR SELECT
            USING (auth.uid() = user_id);

          CREATE POLICY "Users can create own motivation content"
            ON motivation_content FOR INSERT
            WITH CHECK (auth.uid() = user_id);

          CREATE POLICY "Users can update own motivation content"
            ON motivation_content FOR UPDATE
            USING (auth.uid() = user_id);

          CREATE POLICY "Users can delete own motivation content"
            ON motivation_content FOR DELETE
            USING (auth.uid() = user_id);

          CREATE INDEX IF NOT EXISTS idx_motivation_content_user_id ON motivation_content(user_id);
          CREATE INDEX IF NOT EXISTS idx_motivation_content_created_at ON motivation_content(created_at DESC);
        `
      });

      if (createError) {
        console.error('Error creating table:', createError);
      }
    }

    // Check if storage bucket exists
    const { data: buckets, error: bucketsError } = await supabase
      .storage
      .listBuckets();

    const bucketExists = buckets?.some(bucket => bucket.name === 'motivation-photos');

    if (!bucketExists) {
      console.log('Creating motivation-photos bucket...');

      const { error: createBucketError } = await supabase
        .storage
        .createBucket('motivation-photos', {
          public: true,
          fileSizeLimit: 5242880, // 5MB
          allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
        });

      if (createBucketError) {
        console.error('Error creating bucket:', createBucketError);
      }
    }

    return { success: true };
  } catch (error) {
    console.error('Error in setup:', error);
    return { success: false, error };
  }
}