import type { S3Client } from '@aws-sdk/client-s3'

import type { CropStorage, S3CropConfig } from './types.js'

const DEFAULT_CACHE_CONTROL = 'public, max-age=31536000, immutable'

function resolveKey(filename: string, prefix?: string): string {
  return prefix ? `${prefix.replace(/\/$/, '')}/${filename}` : filename
}

export function makeS3CropStorage(config: S3CropConfig): CropStorage {
  let client: Promise<S3Client> | undefined
  const getClient = () =>
    (client ??= import('@aws-sdk/client-s3').then(
      ({ S3Client }) =>
        new S3Client({
          credentials: config.config.credentials,
          endpoint: config.config.endpoint,
          forcePathStyle: config.config.forcePathStyle,
          region: config.config.region,
        }),
    ))

  return {
    async upload(ctx) {
      const { PutObjectCommand } = await import('@aws-sdk/client-s3')
      const s3 = await getClient()
      const key = resolveKey(ctx.filename, config.prefix)
      const contentType =
        ctx.format === 'jpeg' ? 'image/jpeg' : ctx.format === 'png' ? 'image/png' : 'image/webp'
      await s3.send(
        new PutObjectCommand({
          ACL: config.acl,
          Body: ctx.buffer,
          Bucket: config.bucket,
          CacheControl: config.cacheControl ?? DEFAULT_CACHE_CONTROL,
          ContentType: contentType,
          Key: key,
        }),
      )
      return { url: config.generateUrl({ filename: ctx.filename, prefix: config.prefix }) }
    },

    async deleteCropsByBase(filenameBase: string) {
      const { DeleteObjectCommand, ListObjectsV2Command } = await import('@aws-sdk/client-s3')
      const s3 = await getClient()
      const Prefix = resolveKey(`${filenameBase}-crop-`, config.prefix)

      let ContinuationToken: string | undefined
      do {
        const page = await s3.send(
          new ListObjectsV2Command({ Bucket: config.bucket, ContinuationToken, Prefix }),
        )
        const keys = (page.Contents ?? []).flatMap(({ Key }) => (Key ? [Key] : []))
        // Single-object deletes: DeleteObjects needs checksums some S3-compatible providers reject.
        await Promise.all(
          keys.map((Key) => s3.send(new DeleteObjectCommand({ Bucket: config.bucket, Key }))),
        )
        ContinuationToken = page.IsTruncated ? page.NextContinuationToken : undefined
      } while (ContinuationToken)
    },
  }
}
