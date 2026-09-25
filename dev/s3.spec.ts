import { beforeEach, describe, expect, test, vi } from 'vitest'

import type { S3CropConfig } from '../src/types.js'

import { makeS3CropStorage } from '../src/s3.js'

type SentCommand = { input: Record<string, unknown>; name: string }

const s3 = vi.hoisted(() => ({
  clients: [] as Array<{ config: Record<string, unknown> }>,
  listPages: [] as Array<Record<string, unknown>>,
  sent: [] as SentCommand[],
}))

vi.mock('@aws-sdk/client-s3', () => {
  class Command {
    constructor(public input: Record<string, unknown>) {}
  }
  class S3Client {
    constructor(public config: Record<string, unknown>) {
      s3.clients.push(this)
    }
    send(command: Command) {
      s3.sent.push({ name: command.constructor.name, input: command.input })
      return Promise.resolve(
        command.constructor.name === 'ListObjectsV2Command' ? (s3.listPages.shift() ?? {}) : {},
      )
    }
  }
  return {
    DeleteObjectCommand: class DeleteObjectCommand extends Command {},
    ListObjectsV2Command: class ListObjectsV2Command extends Command {},
    PutObjectCommand: class PutObjectCommand extends Command {},
    S3Client,
  }
})

function s3Config(bucket: string, accessKeyId: string): S3CropConfig {
  return {
    bucket,
    config: {
      credentials: { accessKeyId, secretAccessKey: 'secret' },
      region: 'eu-central-1',
    },
    generateUrl: ({ filename }) => `https://${bucket}.example.com/${filename}`,
    prefix: 'crops',
  }
}

const upload = { buffer: Buffer.from(''), cropName: 'hero', format: 'webp', mediaId: '1' } as const

beforeEach(() => {
  s3.clients.length = 0
  s3.listPages.length = 0
  s3.sent.length = 0
})

describe('makeS3CropStorage', () => {
  test('pages through every listed object and deletes them all', async () => {
    const keys = (from: number, count: number) =>
      Array.from({ length: count }, (_, i) => ({ Key: `crops/photo-crop-${from + i}.webp` }))
    s3.listPages.push(
      { Contents: keys(0, 1000), IsTruncated: true, NextContinuationToken: 'page-2' },
      { Contents: keys(1000, 5), IsTruncated: false },
    )

    await makeS3CropStorage(s3Config('media', 'key')).deleteCropsByBase('photo')

    const lists = s3.sent.filter((c) => c.name === 'ListObjectsV2Command')
    expect(lists.map((c) => c.input.ContinuationToken)).toEqual([undefined, 'page-2'])
    expect(lists.every((c) => c.input.Prefix === 'crops/photo-crop-')).toBe(true)

    const deleted = s3.sent.filter((c) => c.name === 'DeleteObjectCommand')
    expect(new Set(deleted.map((c) => c.input.Key)).size).toBe(1005)
  })

  test('does nothing when no crops are listed', async () => {
    s3.listPages.push({ IsTruncated: false, KeyCount: 0 })
    await makeS3CropStorage(s3Config('media', 'key')).deleteCropsByBase('photo')
    expect(s3.sent.map((c) => c.name)).toEqual(['ListObjectsV2Command'])
  })

  test('each instance uploads through its own client and bucket', async () => {
    const first = makeS3CropStorage(s3Config('bucket-a', 'key-a'))
    const second = makeS3CropStorage(s3Config('bucket-b', 'key-b'))

    await first.upload({ ...upload, filename: 'a.webp' })
    await second.upload({ ...upload, filename: 'b.webp' })
    await first.upload({ ...upload, filename: 'c.webp' })

    expect(
      s3.clients.map((c) => (c.config.credentials as { accessKeyId: string }).accessKeyId),
    ).toEqual(['key-a', 'key-b'])
    expect(s3.sent.map((c) => [c.input.Bucket, c.input.Key])).toEqual([
      ['bucket-a', 'crops/a.webp'],
      ['bucket-b', 'crops/b.webp'],
      ['bucket-a', 'crops/c.webp'],
    ])
  })
})
