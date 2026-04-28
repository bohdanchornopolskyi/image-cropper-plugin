import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { s3Storage } from '@payloadcms/storage-s3'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import path from 'path'
import { buildConfig } from 'payload'
import { cropImageField, cropImagePlugin } from 'payload-plugin-image-cropper'
import sharp from 'sharp'
import { fileURLToPath } from 'url'

import { testEmailAdapter } from './helpers/testEmailAdapter.js'
import { seed } from './seed.js'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

if (!process.env.ROOT_DIR) {
  process.env.ROOT_DIR = dirname
}

const buildConfigWithMemoryDB = async () => {
  if (process.env.NODE_ENV === 'test') {
    const memoryDB = await MongoMemoryReplSet.create({
      replSet: {
        count: 3,
        dbName: 'payloadmemory',
      },
    })

    process.env.DATABASE_URL = `${memoryDB.getUri()}&retryWrites=true`
  }

  return buildConfig({
    admin: {
      importMap: {
        baseDir: path.resolve(dirname),
      },
    },
    collections: [
      {
        slug: 'posts',
        fields: [
          cropImageField({
            name: 'heroImage',
            crops: [
              {
                name: 'desktop',
                aspectRatio: 16 / 9,
                height: 1080,
                label: 'Desktop',
                width: 1920,
              },
              {
                name: 'mobile',
                aspectRatio: 9 / 16,
                height: 1470,
                label: 'Mobile',
                width: 828,
              },
            ],
            label: 'Hero Image',
          }),
          cropImageField({
            name: 'cardImage',
            crops: [
              {
                name: 'card',
                aspectRatio: 16 / 9,
                label: 'Card (16:9)',
                sizes: [
                  { name: 'lg', height: 675, label: 'Large (desktop)', width: 1200 },
                  { name: 'md', height: 432, label: 'Medium (tablet)', width: 768 },
                  { name: 'sm', height: 219, label: 'Small (mobile)', width: 390 },
                ],
              },
            ],
            label: 'Card Image',
          }),
        ],
      },
      {
        slug: 'media',
        fields: [],
        upload: {
          staticDir: path.resolve(dirname, 'media'),
        },
      },
    ],
    db: mongooseAdapter({
      ensureIndexes: true,
      url: process.env.DATABASE_URL || '',
    }),
    editor: lexicalEditor(),
    email: testEmailAdapter,
    onInit: async (payload) => {
      await seed(payload)
    },
    plugins: [
      s3Storage({
        acl: 'public-read',
        bucket: process.env.DO_SPACES_BUCKET!,
        collections: {
          media: {
            generateFileURL: ({ filename, prefix }) => {
              const parts = [process.env.DO_SPACES_CDN_ENDPOINT, prefix, filename].filter(Boolean)
              return parts.join('/')
            },
            prefix: process.env.DO_SPACES_LOCATION,
          },
        },
        config: {
          credentials: {
            accessKeyId: process.env.DO_SPACES_ACCESS_KEY!,
            secretAccessKey: process.env.DO_SPACES_SECRET_KEY!,
          },
          endpoint: process.env.DO_SPACES_ENDPOINT!,
          forcePathStyle: false,
          region: process.env.DO_SPACES_REGION!,
        },
        disableLocalStorage: false,
      }),
      cropImagePlugin({
        mediaCollectionSlug: 'media',
        mediaDir: path.resolve(dirname, 'media'),
        s3: {
          acl: 'public-read',
          bucket: process.env.DO_SPACES_BUCKET!,
          config: {
            credentials: {
              accessKeyId: process.env.DO_SPACES_ACCESS_KEY!,
              secretAccessKey: process.env.DO_SPACES_SECRET_KEY!,
            },
            endpoint: process.env.DO_SPACES_ENDPOINT!,
            forcePathStyle: false,
            region: process.env.DO_SPACES_REGION!,
          },
          generateUrl: ({ filename, prefix }) => {
            const parts = [process.env.DO_SPACES_CDN_ENDPOINT, prefix, filename].filter(Boolean)
            return parts.join('/')
          },
          prefix: process.env.DO_SPACES_LOCATION,
        },
      }),
    ],
    secret: process.env.PAYLOAD_SECRET || 'test-secret_key',
    sharp,
    typescript: {
      outputFile: path.resolve(dirname, 'payload-types.ts'),
    },
  })
}

export default buildConfigWithMemoryDB()
