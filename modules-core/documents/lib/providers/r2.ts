// Cloudflare R2 Storage Provider for Documents

import { S3Client } from '@aws-sdk/client-s3'
import { REQUIRED_ENV_VARS } from '../../types'
import { S3CompatibleProvider } from './s3-compatible'

export class R2StorageProvider extends S3CompatibleProvider {
  // bucketOverride lets the caller use a bucket different from the one in
  // ARI_R2_BUCKET — used to read files that were uploaded under a previous
  // bucket name after the env var was changed.
  constructor(bucketOverride?: string) {
    const required = REQUIRED_ENV_VARS.r2.filter(
      (name) => !(bucketOverride && name === 'ARI_R2_BUCKET')
    )
    const missing = required.filter((name) => !process.env[name])
    if (missing.length > 0) {
      throw new Error(`Missing Cloudflare R2 environment variables: ${missing.join(', ')}`)
    }

    const client = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.ARI_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.ARI_R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.ARI_R2_SECRET_ACCESS_KEY!,
      },
    })

    super(client, bucketOverride || process.env.ARI_R2_BUCKET!, 'r2')
  }
}
