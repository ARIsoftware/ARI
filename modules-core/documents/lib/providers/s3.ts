// AWS S3 Storage Provider for Documents

import { S3Client } from '@aws-sdk/client-s3'
import { REQUIRED_ENV_VARS } from '../../types'
import { S3CompatibleProvider } from './s3-compatible'

export class S3StorageProvider extends S3CompatibleProvider {
  // bucketOverride lets the caller use a bucket different from the one in
  // ARI_S3_BUCKET — used to read files that were uploaded under a previous
  // bucket name after the env var was changed.
  constructor(bucketOverride?: string) {
    // ARI_S3_REGION defaults to 'us-east-1'; ARI_S3_BUCKET is only required
    // when no override is provided.
    const required = REQUIRED_ENV_VARS.s3.filter(
      (name) => !(bucketOverride && name === 'ARI_S3_BUCKET')
    )
    const missing = required.filter((name) => !process.env[name])
    if (missing.length > 0) {
      throw new Error(`Missing AWS S3 environment variables: ${missing.join(', ')}`)
    }

    const client = new S3Client({
      region: process.env.ARI_S3_REGION || 'us-east-1',
      endpoint: process.env.ARI_S3_ENDPOINT || undefined,
      credentials: {
        accessKeyId: process.env.ARI_S3_ACCESS_KEY_ID!,
        secretAccessKey: process.env.ARI_S3_SECRET_ACCESS_KEY!,
      },
    })

    super(client, bucketOverride || process.env.ARI_S3_BUCKET!, 's3')
  }
}
