import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { s3Storage } from '@payloadcms/storage-s3'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import path from 'path'
import { buildConfig } from 'payload'
import { createCropImage } from 'payload-plugin-image-cropper'
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

  const { plugin: cropPlugin, field: cropField } = createCropImage({
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
  })

  return buildConfig({
    admin: {
      importMap: {
        baseDir: path.resolve(dirname),
      },
    },
    i18n: {
      fallbackLanguage: 'en',
      supportedLanguages: await Promise.all([
        import('@payloadcms/translations/languages/de'),
        import('@payloadcms/translations/languages/en'),
      ]).then(([{ de }, { en }]) => ({ de, en })),
    },
    collections: [
      {
        slug: 'posts',
        fields: [
          cropField({
            name: 'heroImage',
            crops: [
              {
                name: 'desktop',
                aspectRatio: 16 / 9,
                height: 1080,
                label: { en: 'Desktop', de: 'Desktop' },
                width: 1920,
              },
              {
                name: 'mobile',
                aspectRatio: 9 / 16,
                height: 1470,
                label: { en: 'Mobile', de: 'Mobil' },
                width: 828,
              },
            ],
            label: { en: 'Hero Image', de: 'Heldenbild' },
          }),
          cropField({
            name: 'cardImage',
            crops: [
              {
                name: 'card',
                aspectRatio: 16 / 9,
                label: { en: 'Card (16:9)', de: 'Karte (16:9)' },
                sizes: [
                  { name: 'lg', height: 675, label: { en: 'Large (desktop)', de: 'Groß (Desktop)' }, width: 1200 },
                  { name: 'md', height: 432, label: { en: 'Medium (tablet)', de: 'Mittel (Tablet)' }, width: 768 },
                  { name: 'sm', height: 219, label: { en: 'Small (mobile)', de: 'Klein (Mobil)' }, width: 390 },
                ],
              },
            ],
            label: { en: 'Card Image', de: 'Kartenbild' },
          }),
          cropField({
            name: 'cardImage2',
            crops: [
              {
                name: 'card',
                aspectRatio: 16 / 9,
                label: { en: 'Card (16:9)', de: 'Karte (16:9)' },
                sizes: [{ name: 'sm', height: 219, label: { en: 'Small (mobile)', de: 'Klein (Mobil)' }, width: 390 }],
              },
            ],
            label: { en: 'Card Image (2)', de: 'Kartenbild (2)' },
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
      cropPlugin,
    ],
    secret: process.env.PAYLOAD_SECRET || 'test-secret_key',
    sharp,
    typescript: {
      outputFile: path.resolve(dirname, 'payload-types.ts'),
    },
  })
}

export default buildConfigWithMemoryDB()
