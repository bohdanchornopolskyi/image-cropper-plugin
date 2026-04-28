import type { S3Client } from '@aws-sdk/client-s3'

import type { CropStorage, OnCropGeneratedContext, S3CropConfig } from './types.js'

let cachedClient: S3Client | undefined

async function getClient(config: S3CropConfig): Promise<S3Client> {
  if (cachedClient) return cachedClient
  const { S3Client } = await import('@aws-sdk/client-s3')
  cachedClient = new S3Client({
    credentials: config.config.credentials,
    endpoint: config.config.endpoint,
    forcePathStyle: config.config.forcePathStyle,
    region: config.config.region,
  })
  return cachedClient
}

function resolveKey(filename: string, prefix?: string): string {
  return prefix ? `${prefix.replace(/\/$/, '')}/${filename}` : filename
}

export function makeS3CropStorage(config: S3CropConfig): CropStorage {
  return {
    async upload(ctx: OnCropGeneratedContext) {
      const { PutObjectCommand } = await import('@aws-sdk/client-s3')
      const client = await getClient(config)
      const key = resolveKey(ctx.filename, config.prefix)
      const contentType =
        ctx.format === 'jpeg' ? 'image/jpeg' : ctx.format === 'png' ? 'image/png' : 'image/webp'
      await client.send(
        new PutObjectCommand({
          ACL: config.acl,
          Body: ctx.buffer,
          Bucket: config.bucket,
          ContentType: contentType,
          Key: key,
        }),
      )
      return { url: config.generateUrl({ filename: ctx.filename, prefix: config.prefix }) }
    },

    async deleteCropsByBase(filenameBase: string) {
      const { DeleteObjectCommand, ListObjectsV2Command } = await import('@aws-sdk/client-s3')
      const client = await getClient(config)
      const rawPrefix = `${filenameBase}-crop-`
      const listPrefix = config.prefix
        ? `${config.prefix.replace(/\/$/, '')}/${rawPrefix}`
        : rawPrefix

      const list = await client.send(
        new ListObjectsV2Command({ Bucket: config.bucket, Prefix: listPrefix }),
      )

      if (!list.Contents?.length) return

      await Promise.all(
        list.Contents.map(({ Key }) =>
          client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: Key! })),
        ),
      )
    },
  }
}
