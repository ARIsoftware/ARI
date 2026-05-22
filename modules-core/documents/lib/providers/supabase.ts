// Supabase Storage Provider for Documents (S3-compatible)
//
// Uses Supabase's S3-compatible endpoint via the AWS SDK rather than the
// supabase-js Storage API. This keeps a single set of S3 credentials
// (ARI_SUPABASE_S3_*) aligned with ARI's central storage config and avoids
// requiring two parallel sets of Supabase env vars.

import { S3Client } from '@aws-sdk/client-s3'
import { REQUIRED_ENV_VARS } from '../../types'
import { S3CompatibleProvider } from './s3-compatible'

export class SupabaseStorageProvider extends S3CompatibleProvider {
  // bucketOverride lets the caller read files uploaded under a different
  // bucket name in the past (snapshot stored on the document row).
  constructor(bucketOverride?: string) {
    const required = REQUIRED_ENV_VARS.supabase.filter(
      (name) => !(bucketOverride && name === 'ARI_SUPABASE_S3_BUCKET')
    )
    const missing = required.filter((name) => !process.env[name])
    if (missing.length > 0) {
      throw new Error(`Missing Supabase S3 environment variables: ${missing.join(', ')}`)
    }

    const client = new S3Client({
      region: process.env.ARI_SUPABASE_S3_REGION || 'us-east-1',
      endpoint: process.env.ARI_SUPABASE_S3_ENDPOINT!,
      forcePathStyle: true, // Supabase S3 endpoints require path-style URLs.
      credentials: {
        accessKeyId: process.env.ARI_SUPABASE_S3_ACCESS_KEY_ID!,
        secretAccessKey: process.env.ARI_SUPABASE_S3_SECRET_ACCESS_KEY!,
      },
    })

    super(client, bucketOverride || process.env.ARI_SUPABASE_S3_BUCKET!, 'supabase')
  }
}
