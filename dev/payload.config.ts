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

  const { field: cropField, plugin: cropPlugin } = createCropImage({
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
    collections: [
      {
        slug: 'posts',
        admin: {
          preview: (doc) => `/demo?id=${doc.id}`,
        },
        fields: [
          cropField({
            name: 'heroImage',
            crops: [
              {
                name: 'desktop',
                aspectRatio: 16 / 9,
                height: 1080,
                label: { de: 'Desktop', en: 'Desktop' },
                width: 1920,
              },
              {
                name: 'mobile',
                aspectRatio: 9 / 16,
                height: 1470,
                label: { de: 'Mobil', en: 'Mobile' },
                width: 828,
              },
            ],
            label: { de: 'Heldenbild', en: 'Hero Image' },
          }),
          cropField({
            name: 'cardImage',
            crops: [
              {
                name: 'card',
                aspectRatio: 16 / 9,
                label: { de: 'Karte (16:9)', en: 'Card (16:9)' },
                sizes: [
                  {
                    name: 'lg',
                    height: 675,
                    label: { de: 'Groß (Desktop)', en: 'Large (desktop)' },
                    width: 1200,
                  },
                  {
                    name: 'md',
                    height: 432,
                    label: { de: 'Mittel (Tablet)', en: 'Medium (tablet)' },
                    width: 768,
                  },
                  {
                    name: 'sm',
                    height: 219,
                    label: { de: 'Klein (Mobil)', en: 'Small (mobile)' },
                    width: 390,
                  },
                ],
              },
            ],
            // Demonstrates focalPoint:false — no marker, crops seed from the centre.
            focalPoint: false,
            label: { de: 'Kartenbild', en: 'Card Image' },
          }),
          cropField({
            name: 'cardImage2',
            crops: [
              {
                name: 'card',
                aspectRatio: 16 / 9,
                label: { de: 'Karte (16:9)', en: 'Card (16:9)' },
                sizes: [
                  {
                    name: 'sm',
                    height: 219,
                    label: { de: 'Klein (Mobil)', en: 'Small (mobile)' },
                    width: 390,
                  },
                ],
              },
            ],
            label: { de: 'Kartenbild (2)', en: 'Card Image (2)' },
          }),
        ],
      },
      {
        slug: 'pages',
        fields: [
          cropField({
            name: 'coverImage',
            crops: [
              { name: 'wide', aspectRatio: 16 / 9, height: 1080, label: 'Wide', width: 1920 },
            ],
            label: 'Cover Image',
            required: true,
          }),
        ],
      },
      {
        slug: 'media',
        fields: [],
        upload: {
          focalPoint: true,
          // A focal-point-cropped size, so the suite can assert how Payload's own
          // derived sizes react (or don't) to a focalX/focalY write.
          imageSizes: [{ name: 'square', crop: 'center', height: 100, width: 100 }],
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
    i18n: {
      fallbackLanguage: 'en',
      supportedLanguages: await Promise.all([
        import('@payloadcms/translations/languages/de'),
        import('@payloadcms/translations/languages/en'),
      ]).then(([{ de }, { en }]) => ({ de, en })),
    },
    onInit: async (payload) => {
      await seed(payload)
    },
    plugins: [
      // Skipped under test: uploading to live DO Spaces would make the integration
      // suite depend on network and real credentials. Local disk is enough there.
      ...(process.env.NODE_ENV === 'test'
        ? []
        : [
            s3Storage({
              acl: 'public-read',
              bucket: process.env.DO_SPACES_BUCKET!,
              collections: {
                media: {
                  generateFileURL: ({ filename, prefix }) => {
                    const parts = [process.env.DO_SPACES_CDN_ENDPOINT, prefix, filename].filter(
                      Boolean,
                    )
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
          ]),
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
